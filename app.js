/* ============================================
   جیب من — app.js
   ============================================ */

const STORAGE_KEY = 'jib_man_v9';

const defaultData = {
  accounts: [], transactions: [], installments: [], plans: {},
  categories: {
    expense: [
      {id:'fastfood',name:'فست‌فود',emoji:'🍔',color:'#f97316'},
      {id:'coffee',name:'قهوه',emoji:'☕',color:'#92400e'},
      {id:'restaurant',name:'رستوران',emoji:'🍽️',color:'#e11d48'},
      {id:'market',name:'سوپرمارکت',emoji:'🛒',color:'#10b981'},
      {id:'taxi',name:'تاکسی',emoji:'🚕',color:'#eab308'},
      {id:'transport',name:'حمل‌ونقل',emoji:'🚌',color:'#3b82f6'},
      {id:'gas',name:'بنزین',emoji:'⛽',color:'#0ea5e9'},
      {id:'rent',name:'اجاره',emoji:'🏠',color:'#8b5cf6'},
      {id:'bill',name:'قبض',emoji:'💡',color:'#f59e0b'},
      {id:'internet',name:'اینترنت',emoji:'🌐',color:'#06b6d4'},
      {id:'installment',name:'قسط',emoji:'💰',color:'#dc2626'},
      {id:'fun',name:'تفریح',emoji:'🎮',color:'#ec4899'},
      {id:'shopping',name:'خرید',emoji:'🛍️',color:'#a855f7'},
      {id:'medicine',name:'دارو',emoji:'💊',color:'#22c55e'},
      {id:'other',name:'سایر',emoji:'📦',color:'#64748b'}
    ],
    income: [
      {id:'deposit',name:'واریز به کارت',emoji:'💵',color:'#10b981'},
      {id:'salary',name:'حقوق',emoji:'💼',color:'#3b82f6'},
      {id:'freelance',name:'پروژه',emoji:'💻',color:'#0ea5e9'},
      {id:'profit',name:'سود',emoji:'📈',color:'#8b5cf6'},
      {id:'gift_in',name:'هدیه',emoji:'🎁',color:'#ec4899'},
      {id:'other_income',name:'سایر',emoji:'📦',color:'#64748b'}
    ]
  },
  settings: {theme:'light', setupDone:false, reminderDays:3, notifEnabled:false}
};

const state = {
  data: loadData(),
  activeTab:'dashboard',
  form:{type:'expense',amount:0,category:null,note:'',date:new Date(),accountId:''},
  dp:{year:0,month:0,day:0,target:'form'},
  filters:{type:'all',month:'all'},
  reportPeriod:'month',
  catManageType:'expense',
  editingTxId:null,
  editForm:{},
  editingInstId:null,
  editingPlanId:null,
  editingPlanType:'expense',
  payInstId:null,
  payDate:new Date(),
  setupCards:[],
  editingCardId:null,
  planMonth:{y:0,m:0},
  currentUser: null,
  syncInProgress: false
};

function loadData(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw){
      const old = localStorage.getItem('jib_man_v8')||localStorage.getItem('jib_man_v7')||localStorage.getItem('jib_man_v6')||localStorage.getItem('jib_man_v5');
      if(old){
        const p = JSON.parse(old);
        return mergeDefault(p);
      }
      return JSON.parse(JSON.stringify(defaultData));
    }
    const p = JSON.parse(raw);
    return mergeDefault(p);
  }catch(e){ return JSON.parse(JSON.stringify(defaultData)); }
}
function mergeDefault(p){
  return Object.assign({}, defaultData, p,
    {settings:Object.assign({}, defaultData.settings, p.settings||{})},
    {categories:Object.assign({}, defaultData.categories, p.categories||{})},
    {accounts: p.accounts||[]},
    {transactions: p.transactions||[]},
    {installments: p.installments||[]},
    {plans: p.plans||{}});
}

function saveData(){
  try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(state.data)); }
  catch(e){ console.error(e); }
  if(navigator.onLine){
    scheduleAutoSync();
  } else {
    if(typeof updateSyncStatus === 'function') updateSyncStatus('pending');
  }
}
let autoSyncTimer = null;
let autoSyncLock = false;
function scheduleAutoSync(){
  if(autoSyncTimer) clearTimeout(autoSyncTimer);
  autoSyncTimer = setTimeout(async () => {
    if(!state.currentUser){
      try {
        if(typeof sbClient !== 'undefined' && sbClient){
          const { data: { session } } = await sbClient.auth.getSession();
          if(session){ state.currentUser = session.user; }
          else { return; }
        } else { return; }
      } catch(e){ return; }
    }
    if(autoSyncLock) return;
    autoSyncLock = true;
    try{
      if(typeof uploadToCloud === 'function'){
        await uploadToCloud(state.data);
      }
    }catch(e){
      console.error('خطا در سینک خودکار:', e);
    } finally { autoSyncLock = false; }
  }, 2000);
}

let lastSyncCheck = 0;
setInterval(async () => {
  if(!navigator.onLine) return;
  if(!state.currentUser) return;
  if(autoSyncLock) return;
  if(Date.now() - lastSyncCheck < 50000) return;
  lastSyncCheck = Date.now();
  try {
    if(typeof downloadFromCloud === 'function'){
      const cloud = await downloadFromCloud();
      const cloudCount = cloud.transactions.length + cloud.accounts.length + cloud.installments.length;
      const localCount = state.data.transactions.length + state.data.accounts.length + state.data.installments.length;
      if(cloudCount > localCount && cloud.transactions.length > 0){
        state.data.accounts = cloud.accounts;
        state.data.transactions = cloud.transactions;
        state.data.installments = cloud.installments;
        state.data.plans = cloud.plans;
        if(cloud.categories) state.data.categories = cloud.categories;
        if(cloud.settings) state.data.settings = Object.assign(state.data.settings, cloud.settings);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state.data));
        if(typeof renderDashboard === 'function'){
          if(state.activeTab === 'dashboard') renderDashboard();
          else if(state.activeTab === 'transactions') renderTransactions();
          else if(state.activeTab === 'installments') renderInstallments();
        }
      }
    }
  } catch(e){ console.warn('چک خودکار خطا:', e); }
}, 60000);

async function manualSync(){
  if(!state.currentUser){ showToast('اول وارد شو','error'); return; }
  if(!navigator.onLine){ showToast('اینترنت وصل نیست','error'); return; }
  if(autoSyncLock){ showToast('در حال سینک...'); return; }
  autoSyncLock = true;
  if(typeof updateSyncStatus === 'function') updateSyncStatus('syncing');
  showToast('🔄 در حال سینک...');
  try {
    if(typeof uploadToCloud === 'function'){
      await uploadToCloud(state.data);
    }
    if(typeof downloadFromCloud === 'function'){
      const cloud = await downloadFromCloud();
      const cloudCount = cloud.transactions.length + cloud.accounts.length + cloud.installments.length;
      const localCount = state.data.transactions.length + state.data.accounts.length + state.data.installments.length;
      if(cloudCount >= localCount){
        state.data.accounts = cloud.accounts;
        state.data.transactions = cloud.transactions;
        state.data.installments = cloud.installments;
        state.data.plans = cloud.plans;
        if(cloud.categories) state.data.categories = cloud.categories;
        if(cloud.settings) state.data.settings = Object.assign(state.data.settings, cloud.settings);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state.data));
      }
    }
    if(typeof updateSyncStatus === 'function') updateSyncStatus('online');
    showToast('✅ سینک کامل شد');
    if(typeof renderDashboard === 'function') renderDashboard();
    if(typeof renderTransactions === 'function') renderTransactions();
    if(typeof renderInstallments === 'function') renderInstallments();
  } catch(e){
    console.error(e);
    showToast('خطا در سینک','error');
    if(typeof updateSyncStatus === 'function') updateSyncStatus('pending');
  } finally { autoSyncLock = false; }
}
window.manualSync = manualSync;

const toFa = s => String(s).replace(/\d/g,d=>'۰۱۲۳۴۵۶۷۸۹'[d]);
const toEn = s => String(s).replace(/[۰-۹]/g,d=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(d));
const $ = id => document.getElementById(id);

function fmtMoney(n){ n=Math.round(Number(n)||0); return toFa(n.toLocaleString('en-US'))+' تومان'; }
function fmtMoneyShort(n){
  n=Math.round(Number(n)||0);
  if(n>=1000000000) return toFa((n/1000000000).toFixed(1))+'میلیارد';
  if(n>=1000000) return toFa((n/1000000).toFixed(n%1000000?1:0))+'میلیون';
  if(n>=1000) return toFa((n/1000).toFixed(0))+'هزار';
  return toFa(n);
}
function fmtNumInput(v){ const c=toEn(v).replace(/\D/g,''); return c?Number(c).toLocaleString('en-US'):''; }
function parseAmount(v){ const c=toEn(v).replace(/\D/g,''); return c?Number(c):0; }

function numberToPersianWords(n){
  n=Math.round(Number(n)||0);
  if(n===0) return 'صفر';
  const yekan=['','یک','دو','سه','چهار','پنج','شش','هفت','هشت','نه'];
  const dahgan=['','','بیست','سی','چهل','پنجاه','شصت','هفتاد','هشتاد','نود'];
  const dah=['ده','یازده','دوازده','سیزده','چهارده','پانزده','شانزده','هفده','هجده','نوزده'];
  const sadgan=['','صد','دویست','سیصد','چهارصد','پانصد','ششصد','هفتصد','هشتصد','نهصد'];
  const scales=['','هزار','میلیون','میلیارد'];
  function three(num){
    const p=[]; const s=Math.floor(num/100); const r=num%100;
    if(s) p.push(sadgan[s]);
    if(r>=10&&r<20) p.push(dah[r-10]);
    else { const d=Math.floor(r/10); const y=r%10; if(d) p.push(dahgan[d]); if(y) p.push(yekan[y]); }
    return p.join(' و ');
  }
  const g=[]; let i=0;
  while(n>0){ const x=n%1000; if(x) g.unshift(three(x)+(scales[i]?' '+scales[i]:'')); n=Math.floor(n/1000); i++; }
  return g.join(' و ');
}

function toJalaliParts(date){
  const p=new Intl.DateTimeFormat('en-US-u-ca-persian',{year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
  return {y:+p.find(x=>x.type==='year').value,m:+p.find(x=>x.type==='month').value,d:+p.find(x=>x.type==='day').value};
}
function jalaliShort(d=new Date()){ const {y,m,d:dd}=toJalaliParts(d); return `${y}/${String(m).padStart(2,'0')}/${String(dd).padStart(2,'0')}`; }
function jalaliLong(d=new Date()){ try{ return new Intl.DateTimeFormat('fa-IR',{weekday:'long',year:'numeric',month:'long',day:'numeric'}).format(d); }catch(e){ return d.toLocaleDateString('fa-IR'); } }
function jalaliMonthKey(d=new Date()){ const {y,m}=toJalaliParts(d); return `${y}-${String(m).padStart(2,'0')}`; }
function jalaliMonthName(k){ const [y,m]=k.split('-').map(Number); const n=['فروردین','اردیبهشت','خرداد','تیر','مرداد','شهریور','مهر','آبان','آذر','دی','بهمن','اسفند']; return `${n[m-1]} ${toFa(y)}`; }
function fmtTime(d){ return `${toFa(String(d.getHours()).padStart(2,'0'))}:${toFa(String(d.getMinutes()).padStart(2,'0'))}`; }
function relativeDateLabel(d){
  const diff=Math.floor((new Date().setHours(0,0,0,0)-new Date(d).setHours(0,0,0,0))/86400000);
  if(diff===0) return 'امروز'; if(diff===1) return 'دیروز'; if(diff===2) return 'پریروز';
  if(diff>0&&diff<7) return toFa(diff)+' روز پیش';
  return jalaliShort(d);
}
function uid(){ return Date.now().toString(36)+Math.random().toString(36).slice(2,8); }

let toastTimer;
function showToast(msg,type='success'){
  const el=$('toast'); if(!el) return;
  el.textContent=msg; el.className=type; el.style.opacity='1';
  clearTimeout(toastTimer); toastTimer=setTimeout(()=>{ el.style.opacity='0'; },2500);
}

function findCategory(type,id){ return (state.data.categories[type==='income'?'income':'expense']||[]).find(c=>c.id===id); }
function findAccount(id){ return state.data.accounts.find(a=>a.id===id); }
function getAccountBalance(id){
  const acc=findAccount(id); if(!acc) return 0;
  let bal=Number(acc.initialBalance)||0;
  state.data.transactions.forEach(t=>{
    if(t.accountId!==id) return;
    if(t.type==='income') bal+=Number(t.amount)||0; else bal-=Number(t.amount)||0;
  });
  return bal;
}
function getTotalBalance(){ return state.data.accounts.reduce((s,a)=>s+getAccountBalance(a.id),0); }

function toggleCollapsible(id){ const el=$(id); if(el) el.classList.toggle('open'); }

function jalaliMonthLength(jy,jm){
  if(jm<=6) return 31;
  if(jm<=11) return 30;
  // اسفند
  return isLeapJalaliYear(jy) ? 30 : 29;
}

/* ✅ تابع دقیق تبدیل شمسی به میلادی - با Intl */
function jalaliToGregorian(jy, jm, jd) {
  jy = parseInt(jy); jm = parseInt(jm); jd = parseInt(jd);
  
  // روش ساده و مطمئن: یه تاریخ میلادی حدس بزن، بعد تست کن
  // اگه شمسی برگشتی برابر نبود، ۱ روز جابجا کن
  
  // تخمین اولیه: 1/1/1400 = 21/3/2021
  const baseDate = new Date(2021, 2, 21); // 21 مارس 2021
  baseDate.setHours(12, 0, 0, 0); // ظهر (برای جلوگیری از مشکل timezone)
  
  // تعداد روز تخمینی از 1/1/1400 تا تاریخ هدف
  const daysInMonth = [31, 31, 31, 31, 31, 31, 30, 30, 30, 30, 30, 29];
  
  let totalDays = (jy - 1400) * 365;
  
  // اضافه کردن کبیسه‌ها (تقریبی)
  if (jy > 1400) {
    totalDays += Math.floor((jy - 1400) * 0.2425) + 1;
  }
  
  // اضافه کردن ماه‌ها
  for (let m = 0; m < jm - 1; m++) {
    totalDays += daysInMonth[m];
  }
  
  // اضافه کردن روز
  totalDays += jd - 1;
  
  // تخمین اول
  let guess = new Date(baseDate);
  guess.setDate(guess.getDate() + totalDays);
  guess.setHours(12, 0, 0, 0);
  
  // ✅ اصلاح دقیق: به جای محاسبه، روز به روز چک کن
  // چک کن شمسی guess چی می‌ده
  let maxIterations = 40; // حداکثر ۴۰۰ بار (برای سال‌های دور)
  let iterations = 0;
  
  while (iterations < maxIterations) {
    iterations++;
    
    const j = toJalaliParts(guess);
    
    if (j.y === jy && j.m === jm && j.d === jd) {
      // درست شد
      break;
    }
    
    // محاسبه اختلاف
    const yDiff = jy - j.y;
    const mDiff = jm - j.m;
    const dDiff = jd - j.d;
    
    // اگه سال فرق داره، خیلی جابجا شو
    if (yDiff !== 0) {
      guess.setFullYear(guess.getFullYear() + yDiff);
    } else if (mDiff !== 0) {
      guess.setMonth(guess.getMonth() + mDiff);
    } else if (dDiff !== 0) {
      guess.setDate(guess.getDate() + dDiff);
    } else {
      break;
    }
  }
  
  guess.setHours(0, 0, 0, 0);
  return guess;
}

/* ✅ تابع دقیق کبیسه شمسی */
function isLeapJalaliYear(jy) {
  jy = parseInt(jy);
  // باقی‌مانده‌های کبیسه در دوره 33 ساله
  const remainder = jy % 33;
  const leapRemainders = [1, 5, 9, 13, 17, 22, 26, 30];
  return leapRemainders.includes(remainder);
}

function addJalaliMonths(jy, jm, n){
  let total = jy*12 + (jm-1) + n;
  return {y: Math.floor(total/12), m: (total%12)+1};
}

/* ===== محاسبه وضعیت قسط (نسخه جدید) ===== */
function getInstStatus(inst){
  try {
    const now = new Date();
    const today = toJalaliParts(now);
    const paidMonths = Object.keys(inst.paidMonths||{});
    
    // ماه ساخت
    let createdKey = inst.createdMonth;
    if(!createdKey) createdKey = jalaliMonthKey(now);
    
    const parts = createdKey.split('-');
    const cy = parseInt(parts[0]) || today.y;
    const cm = parseInt(parts[1]) || today.m;
    const dueDay = Math.max(1, Math.min(31, inst.day || 1));
    
    // 🔐 پیدا کردن سررسید بعدی
    let firstDueDate = null;
    let firstUnpaid = null;
    let isPast = false;
    let daysDiff = 0;
    
    // از ماه جاری شروع کن و برو جلو
    let searchY = today.y;
    let searchM = today.m;
    let safety = 0;
    let found = false;
    
    while(safety < 24 && !found){
      safety++;
      
      const monthLen = jalaliMonthLength(searchY, searchM);
      const clampedDay = Math.min(dueDay, monthLen);
      const monthKey = `${searchY}-${String(searchM).padStart(2, '0')}`;
      const isPaid = paidMonths.includes(monthKey);
      
      // چک کن سررسید این ماه رسیده یا نه
      let status;
      if(searchY < today.y || (searchY === today.y && searchM < today.m)){
        status = 'past';
      } else if(searchY === today.y && searchM === today.m){
        if(clampedDay < today.d) status = 'past';
        else if(clampedDay === today.d) status = 'today';
        else status = 'future';
      } else {
        status = 'future';
      }
      
      // اگه پرداخت شده و ماه جاری یا گذشته → برو ماه بعد
      if(isPaid && (status === 'past' || status === 'today')){
        searchM++;
        if(searchM > 12){ searchM = 1; searchY++; }
        continue;
      }
      
      // اگه این ماه سررسیدش رسیده یا آینده‌ست → همین سررسید بعدیه
      if(status === 'past' || status === 'today' || status === 'future'){
        if(!isPaid){
          // این سررسید بعدیه
          firstDueDate = jalaliToGregorian(searchY, searchM, clampedDay);
          firstUnpaid = {key: monthKey, y: searchY, m: searchM, dueDay: clampedDay};
          isPast = (status === 'past');
          found = true;
        } else {
          // پرداخت شده → برو ماه بعد
          searchM++;
          if(searchM > 12){ searchM = 1; searchY++; }
        }
      }
    }
    
    if(!firstUnpaid){
      return {status:'paid', unpaidMonths:[], totalAmount:0, count:0, daysDiff:null};
    }
    
    // 🔐 محاسبه فاصله روز
    const todayMid = new Date(now);
    todayMid.setHours(0, 0, 0, 0);
    const dueMid = new Date(firstDueDate);
    dueMid.setHours(0, 0, 0, 0);
    daysDiff = Math.round((dueMid - todayMid) / 86400000);
    
    // 🔐 اگه چند ماه عقب‌افتاده داریم، جمع کن
    const unpaidList = [];
    let checkY = cy, checkM = cm;
    let s2 = 0;
    while(s2 < 36){
      s2++;
      const cLen = jalaliMonthLength(checkY, checkM);
      const cDay = Math.min(dueDay, cLen);
      const cKey = `${checkY}-${String(checkM).padStart(2, '0')}`;
      
      // فقط ماه‌هایی که سررسیدشون رسیده
      let cStatus;
      if(checkY < today.y || (checkY === today.y && checkM < today.m)){
        cStatus = 'past';
      } else if(checkY === today.y && checkM === today.m){
        if(cDay < today.d) cStatus = 'past';
        else if(cDay === today.d) cStatus = 'today';
        else cStatus = 'future';
      } else {
        cStatus = 'future';
      }
      
      if(cStatus === 'future' && unpaidList.length > 0) break;
      
      if(!paidMonths.includes(cKey)){
        unpaidList.push({key:cKey, y:checkY, m:checkM, dueDay:cDay});
        if(cStatus === 'past') { /* ادامه بده */ }
        else if(cStatus === 'today' || cStatus === 'future') break;
      }
      
      checkM++;
      if(checkM > 12){ checkM = 1; checkY++; }
      
      // اگه به امروز یا جلوتر رسیدیم
      if(checkY > today.y || (checkY === today.y && checkM > today.m)) break;
    }
    
    const count = unpaidList.length || 1;
    const totalAmount = inst.amount * count;
    
    // 🔐 تعیین وضعیت
    let status = 'ok';
    if(isPast || daysDiff < 0){
      status = 'danger';
    } else if(daysDiff <= 3){
      status = 'warn';
    }
    
    return {
      status: status,
      unpaidMonths: unpaidList,
      totalAmount: totalAmount,
      firstDue: firstDueDate,
      firstUnpaid: firstUnpaid,
      daysDiff: daysDiff,
      count: count,
      isPast: isPast
    };
    
  } catch(e){
    console.error('خطا در getInstStatus:', e, inst);
    return {status: 'danger', unpaidMonths: [], totalAmount: inst.amount, count: 1, daysDiff: 0};
  }
}

function getInstallmentDisplay(inst){
  const info = getInstStatus(inst);
  
  if(info.status === 'paid'){
    return { status:'paid', count:0, totalAmount:0, meta:'✓ این ماه پرداخت شد' };
  }
  
  const first = info.firstUnpaid;
  if(!first){
    return { status:'paid', count:0, totalAmount:0, meta:'✓ پرداخت شد' };
  }
  
  const monthName = jalaliMonthName(`${first.y}-${String(first.m).padStart(2, '0')}`);
  const daysDiff = info.daysDiff;
  const count = info.count || 1;
  
  // 🔴 عقب‌افتاده (چند ماه)
  if(count > 1 && daysDiff < 0){
    return {
      status: 'danger',
      count: count,
      totalAmount: info.totalAmount,
      meta: `${toFa(count)} ماه پرداخت نشده — از ${first.dueDay} ${monthName}`,
      dueDate: info.firstDue,
      unpaidMonths: info.unpaidMonths
    };
  }
  
  // 🔴 یه ماه عقب‌افتاده
  if(daysDiff < 0){
    return {
      status: 'danger',
      count: 1,
      totalAmount: info.totalAmount,
      meta: `${toFa(Math.abs(daysDiff))} روز از سررسید گذشته — ${first.dueDay} ${monthName}`,
      dueDate: info.firstDue,
      unpaidMonths: info.unpaidMonths
    };
  }
  
  // 🟡 امروز سررسید
  if(daysDiff === 0){
    return {
      status: 'warn',
      count: 1,
      totalAmount: info.totalAmount,
      meta: `⏰ امروز سررسید — ${first.dueDay} ${monthName}`,
      dueDate: info.firstDue,
      unpaidMonths: info.unpaidMonths
    };
  }
  
  // 🟡 نزدیک (۱-۳ روز)
  if(daysDiff <= 3){
    return {
      status: 'warn',
      count: 1,
      totalAmount: info.totalAmount,
      meta: `⏰ ${toFa(daysDiff)} روز دیگه — ${first.dueDay} ${monthName}`,
      dueDate: info.firstDue,
      unpaidMonths: info.unpaidMonths
    };
  }
  
  // 🔵 سر وقت
  return {
    status: 'ok',
    count: 1,
    totalAmount: info.totalAmount,
    meta: `📅 ${toFa(daysDiff)} روز دیگه — ${first.dueDay} ${monthName}`,
    dueDate: info.firstDue,
    unpaidMonths: info.unpaidMonths
  };
}

/* ===== Plans ===== */
function getPlanForMonth(y,m){
  const key = `${y}-${String(m).padStart(2,'0')}`;
  if(!state.data.plans[key]) state.data.plans[key] = { income: [], expense: [] };
  if(Array.isArray(state.data.plans[key])) state.data.plans[key] = { income: [], expense: state.data.plans[key] };
  if(!state.data.plans[key].income) state.data.plans[key].income = [];
  if(!state.data.plans[key].expense) state.data.plans[key].expense = [];
  return state.data.plans[key];
}
function savePlanForMonth(y,m,plan){ state.data.plans[`${y}-${String(m).padStart(2,'0')}`] = plan; }

function applyTheme(){
  const t=state.data.settings.theme||'light';
  document.body.classList.toggle('dark',t==='dark');
  const el = $('themeToggle');
  if(el) el.textContent = t==='dark'?'☀️':'🌙';
}

function switchTab(tab){
  state.activeTab=tab;
  ['dashboard','transactions','installments','plan','reports','settings'].forEach(t=>{
    const el = $('tab-'+t);
    if(el) el.classList.add('hidden');
  });
  const tabEl = $('tab-'+tab);
  if(tabEl) tabEl.classList.remove('hidden');
  document.querySelectorAll('.nav-item').forEach(el=>el.classList.toggle('active',el.dataset.tab===tab));
  window.scrollTo({top:0,behavior:'smooth'});
  if(tab==='dashboard') renderDashboard();
  if(tab==='transactions') renderTransactions();
  if(tab==='installments') renderInstallments();
  if(tab==='plan') renderPlan();
  if(tab==='reports') renderReports();
  if(tab==='settings') renderSettings();
}
document.querySelectorAll('.nav-item').forEach(el=>el.addEventListener('click',()=>switchTab(el.dataset.tab)));
const settingsBtnEl = $('settingsBtn');
if(settingsBtnEl) settingsBtnEl.addEventListener('click',()=>switchTab('settings'));
const themeToggleEl = $('themeToggle');
if(themeToggleEl){
  themeToggleEl.addEventListener('click',()=>{
    state.data.settings.theme = state.data.settings.theme==='dark'?'light':'dark';
    saveData(); applyTheme();
  });
}

/* ===== Auth UI ===== */
let authMode = 'login';

function showAuthScreen(){
  const auth = $('authScreen'); if(auth) auth.classList.remove('hidden');
  const setup = $('setupScreen'); if(setup) setup.classList.add('hidden');
  const main = $('mainApp'); if(main) main.classList.add('hidden');
}
function hideAuthScreen(){
  const auth = $('authScreen'); if(auth) auth.classList.add('hidden');
}
function setAuthMode(mode){
  authMode = mode;
  const isLogin = mode === 'login';
  const tl = $('tabLogin'); if(tl) tl.classList.toggle('active', isLogin);
  const ts = $('tabSignup'); if(ts) ts.classList.toggle('active', !isLogin);
  const sub = $('authSubmit'); if(sub) sub.textContent = isLogin ? 'ورود' : 'ثبت‌نام';
  const subt = $('authSubtitle'); if(subt) subt.textContent = isLogin ? 'برای ادامه وارد شو' : 'حساب جدید بساز';
  const ft = $('authFooterText'); if(ft) ft.textContent = isLogin ? 'حساب نداری؟' : 'حساب داری؟';
  const sw = $('authSwitch'); if(sw) sw.textContent = isLogin ? 'ثبت‌نام کن' : 'وارد شو';
  const pw = $('authPassword'); if(pw) pw.autocomplete = isLogin ? 'current-password' : 'new-password';
  hideAuthError();
}
function showAuthError(msg){
  const el = $('authError');
  if(el){ el.textContent = msg; el.classList.remove('hidden'); }
}
function hideAuthError(){
  const el = $('authError');
  if(el) el.classList.add('hidden');
}
const tlEl = $('tabLogin'); if(tlEl) tlEl.addEventListener('click', ()=>setAuthMode('login'));
const tsEl = $('tabSignup'); if(tsEl) tsEl.addEventListener('click', ()=>setAuthMode('signup'));
const swEl = $('authSwitch'); if(swEl) swEl.addEventListener('click', ()=>setAuthMode(authMode==='login'?'signup':'login'));

const authFormEl = $('authForm');
if(authFormEl){
  authFormEl.addEventListener('submit', async (e)=>{
    e.preventDefault();
    const email = $('authEmail').value.trim();
    const password = $('authPassword').value;
    hideAuthError();
    if(!email || !password){
      showAuthError('ایمیل و رمز عبور را وارد کن');
      return;
    }
    if(password.length < 6){
      showAuthError('رمز عبور باید حداقل ۶ کاراکتر باشد');
      return;
    }
    const btn = $('authSubmit');
    btn.disabled = true;
    btn.textContent = authMode==='login' ? 'در حال ورود...' : 'در حال ثبت‌نام...';
    try{
      if(authMode === 'login'){
        await signIn(email, password);
      } else {
        await signUp(email, password);
        await signIn(email, password);
      }
      state.currentUser = currentUser;
      const lastUserId = localStorage.getItem('jib_last_user_id');
      if(lastUserId && lastUserId !== currentUser.id){
        if(typeof clearLocalData === 'function') clearLocalData();
        state.data = JSON.parse(JSON.stringify(defaultData));
      }
      if(typeof saveCurrentUser === 'function') saveCurrentUser(currentUser.id);
      else localStorage.setItem('jib_last_user_id', currentUser.id);
      
      hideAuthScreen();
      setTimeout(onUserLoggedIn, 200);
    }catch(e){
      console.error(e);
      let msg = 'خطا در ورود. دوباره تلاش کن.';
      if(e.message && e.message.includes('Invalid login')) msg = 'ایمیل یا رمز عبور اشتباه است';
      else if(e.message && e.message.includes('already registered')) msg = 'این ایمیل قبلاً ثبت شده';
      else if(e.message && e.message.includes('Email not confirmed')) msg = 'ایمیل تأیید نشده';
      else if(e.message) msg = e.message;
      showAuthError(msg);
      btn.disabled = false;
      btn.textContent = authMode==='login' ? 'ورود' : 'ثبت‌نام';
    }
  });
}

async function onUserLoggedIn(){
  const realUserId = await getCurrentUserId();
  if(!realUserId){
    showAuthScreen();
    return;
  }
  
  state.currentUser = { id: realUserId, email: currentUser?.email || '' };
  const emailEl = $('userEmail');
  if(emailEl) emailEl.textContent = state.currentUser.email || '';
  
  const lastUserKey = 'jib_last_user_id';
  const lastUserId = localStorage.getItem(lastUserKey);
  const userChanged = lastUserId && lastUserId !== realUserId;
  
  if(userChanged){
    state.data = JSON.parse(JSON.stringify(defaultData));
    localStorage.removeItem(STORAGE_KEY);
  }
  
  localStorage.setItem(lastUserKey, realUserId);
  
  const localData = {
    accounts: state.data.accounts || [],
    transactions: state.data.transactions || [],
    installments: state.data.installments || [],
    plans: state.data.plans || {},
    settings: state.data.settings || {}
  };
  const hasLocalData = localData.accounts.length > 0 || localData.transactions.length > 0 || localData.installments.length > 0;
  
  let cloud = null;
  try{
    cloud = await downloadFromCloud();
  }catch(e){
    console.error('خطا در دریافت:', e);
  }
  
  const hasCloudData = cloud && (cloud.accounts.length > 0 || cloud.transactions.length > 0 || cloud.installments.length > 0);
  
  if(hasCloudData){
    state.data.accounts = cloud.accounts;
    state.data.transactions = cloud.transactions;
    state.data.installments = cloud.installments;
    state.data.plans = cloud.plans;
    if(cloud.categories) state.data.categories = cloud.categories;
    if(cloud.settings) state.data.settings = Object.assign(state.data.settings, cloud.settings);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.data));
    showToast('✅ داده‌ها از سرور دریافت شد');
  } else if(hasLocalData){
    try{
      await uploadToCloud(localData);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(localData));
      showToast('✅ داده‌های محلی به سرور منتقل شد');
    }catch(e){
      console.error('خطا در آپلود:', e);
    }
  }

  const hasAnyData = state.data.accounts.length > 0 || 
                     state.data.transactions.length > 0 || 
                     state.data.installments.length > 0 ||
                     state.data.settings.setupDone;
  
  if(!hasAnyData){
    const setup = $('setupScreen'); if(setup) setup.classList.remove('hidden');
    const main = $('mainApp'); if(main) main.classList.add('hidden');
    renderSetup();
  } else {
    if(!state.data.settings.setupDone) state.data.settings.setupDone = true;
    saveData();
    enterMainApp();
  }
}

function renderSetup(){
  const list=$('setupCardList');
  if(!list) return;
  if(!state.setupCards.length){ list.innerHTML='<div class="empty-mini">هنوز کارتی اضافه نکردی</div>'; }
  else {
    list.innerHTML = state.setupCards.map((c,i)=>`
      <div class="card-account">
        <div class="acc-icon" style="background:${c.color}">${c.name.slice(0,2)}</div>
        <div class="acc-info"><div class="acc-name">${c.name}</div><div class="acc-balance num">${fmtMoney(c.initialBalance)}</div></div>
        <button data-idx="${i}" style="width:32px;height:32px;border-radius:8px;background:#fee2e2;color:#dc2626;border:none;cursor:pointer;font-weight:700">✕</button>
      </div>`).join('');
    list.querySelectorAll('button[data-idx]').forEach(b=>{
      b.addEventListener('click',()=>{ state.setupCards.splice(+b.dataset.idx,1); renderSetup(); });
    });
  }
  const totalEl = $('setupTotal');
  if(totalEl) totalEl.textContent = fmtMoney(state.setupCards.reduce((s,c)=>s+(Number(c.initialBalance)||0),0));
}

async function logoutFromSetup(){
  if(!confirm('از حساب خارج می‌شوی؟')) return;
  if(typeof clearAllUserData === 'function') clearAllUserData();
  else {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem('jib_last_user_id');
  }
  state.data = JSON.parse(JSON.stringify(defaultData));
  try{ await signOut(); }catch(e){}
  state.currentUser = null;
  const setup = $('setupScreen'); if(setup) setup.classList.add('hidden');
  showAuthScreen();
  setAuthMode('login');
  const ae = $('authEmail'); if(ae) ae.value = '';
  const ap = $('authPassword'); if(ap) ap.value = '';
  showToast('✅ خارج شدی');
}
window.logoutFromSetup = logoutFromSetup;

function enterMainApp(){
  const setup = $('setupScreen'); if(setup) setup.classList.add('hidden');
  const main = $('mainApp'); if(main) main.classList.remove('hidden');
  applyTheme();
  const hd = $('headerDate'); if(hd) hd.textContent = jalaliLong();
  renderDashboard();
  if(state.currentUser){
    const emailEl = $('userEmail');
    if(emailEl) emailEl.textContent = state.currentUser.email || '';
    if(typeof updateSyncStatus === 'function') updateSyncStatus('online');
  }
}
