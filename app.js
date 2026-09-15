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
  return isLeapJalaliYear(jy) ? 30 : 29;
}

/* ✅ تبدیل شمسی به میلادی - دقیق و سریع */
function jalaliToGregorian(jy, jm, jd) {
  jy = parseInt(jy); jm = parseInt(jm); jd = parseInt(jd);
  
  const baseDate = new Date(2021, 2, 21);
  baseDate.setHours(0, 0, 0, 0);
  
  let diffDays = 0;
  const yearDiff = jy - 1400;
  diffDays += Math.floor(yearDiff * 365.2425);
  
  const monthDays = [31, 31, 31, 31, 31, 31, 30, 30, 30, 30, 30, 29];
  for (let m = 0; m < jm - 1; m++) {
    diffDays += monthDays[m];
  }
  diffDays += jd - 1;
  
  let guess = new Date(baseDate);
  guess.setDate(guess.getDate() + diffDays);
  guess.setHours(0, 0, 0, 0);
  
  // اصلاح دقیق با Intl (حداکثر ۵ بار)
  for (let i = 0; i < 5; i++) {
    const j = toJalaliParts(guess);
    if (j.y === jy && j.m === jm && j.d === jd) break;
    
    const yDiff = jy - j.y;
    const mDiff = jm - j.m;
    const dDiff = jd - j.d;
    
    let dayDiff = 0;
    if (yDiff !== 0) dayDiff += yDiff * 365;
    if (mDiff !== 0) dayDiff += mDiff * 30;
    dayDiff += dDiff;
    
    if (dayDiff === 0) break;
    guess.setDate(guess.getDate() + dayDiff);
  }
  
  guess.setHours(0, 0, 0, 0);
  return guess;
}

function isLeapJalaliYear(jy) {
  jy = parseInt(jy);
  const remainder = jy % 33;
  const leapRemainders = [1, 5, 9, 13, 17, 22, 26, 30];
  return leapRemainders.includes(remainder);
}

function addJalaliMonths(jy, jm, n){
  let total = jy*12 + (jm-1) + n;
  return {y: Math.floor(total/12), m: (total%12)+1};
}

/* ===== محاسبه وضعیت قسط ===== */
ffunction getInstStatus(inst){
  try {
    const now = new Date();
    const today = toJalaliParts(now);
    const paidMonths = Object.keys(inst.paidMonths||{});
    const dueDay = Math.max(1, Math.min(31, inst.day || 1));
    
    // ✅ قدم ۱: پیدا کردن سررسید بعدی (از امروز به بعد)
    let nextY = today.y;
    let nextM = today.m;
    
    // اگه سررسید این ماه گذشته، برو ماه بعد
    const thisMonthLen = jalaliMonthLength(nextY, nextM);
    const thisMonthDay = Math.min(dueDay, thisMonthLen);
    
    if(thisMonthDay < today.d){
      nextM++;
      if(nextM > 12){ nextM = 1; nextY++; }
    }
    
    // ✅ قدم ۲: چک کن سررسید بعدی پرداخت شده یا نه
    let safety = 0;
    while(safety < 24){
      safety++;
      const monthLen = jalaliMonthLength(nextY, nextM);
      const clampedDay = Math.min(dueDay, monthLen);
      const monthKey = `${nextY}-${String(nextM).padStart(2, '0')}`;
      
      if(!paidMonths.includes(monthKey)){
        // این سررسید پرداخت نشده → همینه
        break;
      }
      
      // پرداخت شده → برو ماه بعد
      nextM++;
      if(nextM > 12){ nextM = 1; nextY++; }
    }
    
    const monthLen = jalaliMonthLength(nextY, nextM);
    const clampedDay = Math.min(dueDay, monthLen);
    const monthKey = `${nextY}-${String(nextM).padStart(2, '0')}`;
    const dueDate = jalaliToGregorian(nextY, nextM, clampedDay);
    
    // ✅ قدم ۳: محاسبه فاصله روز
    const todayMid = new Date(now);
    todayMid.setHours(0, 0, 0, 0);
    const dueMid = new Date(dueDate);
    dueMid.setHours(0, 0, 0, 0);
    const daysDiff = Math.round((dueMid - todayMid) / 86400000);
    
    // ✅ قدم ۴: چک کن سررسید ماه قبل پرداخت شده یا نه
    // اگه پرداخت نشده، یعنی عقب‌افتاده
    let prevM = today.m;
    let prevY = today.y;
    
    const thisLen = jalaliMonthLength(prevY, prevM);
    const thisDay = Math.min(dueDay, thisLen);
    
    // اگه سررسید این ماه گذشته، ماه قبل رو چک کن
    if(thisDay >= today.d){
      prevM--;
      if(prevM < 1){ prevM = 12; prevY--; }
    }
    
    const prevLen = jalaliMonthLength(prevY, prevM);
    const prevDay = Math.min(dueDay, prevLen);
    const prevKey = `${prevY}-${String(prevM).padStart(2, '0')}`;
    const prevPaid = paidMonths.includes(prevKey);
    
    // اگه سررسید ماه قبل پرداخت نشده → danger
    if(!prevPaid){
      const prevDate = jalaliToGregorian(prevY, prevM, prevDay);
      const prevMid = new Date(prevDate);
      prevMid.setHours(0, 0, 0, 0);
      const pastDays = Math.round((todayMid - prevMid) / 86400000);
      
      // اگه سررسید ماه قبل هم واقعاً گذشته
      if(pastDays > 0){
        // چک کن ماه قبل‌تر هم پرداخت نشده؟
        const unpaidList = [];
        let checkY = prevY, checkM = prevM, s2 = 0;
        while(s2 < 12){
          s2++;
          const cLen = jalaliMonthLength(checkY, checkM);
          const cDay = Math.min(dueDay, cLen);
          const cKey = `${checkY}-${String(checkM).padStart(2, '0')}`;
          const cDate = jalaliToGregorian(checkY, checkM, cDay);
          const cMid = new Date(cDate);
          cMid.setHours(0, 0, 0, 0);
          const cDays = Math.round((todayMid - cMid) / 86400000);
          
          if(cDays < 0) break; // این سررسید نرسیده
          if(paidMonths.includes(cKey)) break; // پرداخت شده
          
          unpaidList.push({key: cKey, y: checkY, m: checkM, dueDay: cDay});
          
          checkM--;
          if(checkM < 1){ checkM = 12; checkY--; }
        }
        
        const oldest = unpaidList[unpaidList.length - 1];
        const oldestDate = jalaliToGregorian(oldest.y, oldest.m, oldest.dueDay);
        const oldestMid = new Date(oldestDate);
        oldestMid.setHours(0, 0, 0, 0);
        const oldPastDays = Math.round((todayMid - oldestMid) / 86400000);
        
        return {
          status: 'danger',
          unpaidMonths: unpaidList,
          totalAmount: inst.amount * unpaidList.length,
          firstDue: oldestDate,
          firstUnpaid: oldest,
          daysDiff: -oldPastDays,
          count: unpaidList.length,
          isPast: true
        };
      }
    }
    
    // ✅ قدم ۵: تعیین وضعیت
    let status = 'ok';
    if(daysDiff <= 3) status = 'warn';
    if(daysDiff === 0) status = 'warn';
    
    return {
      status: status,
      unpaidMonths: [{key: monthKey, y: nextY, m: nextM, dueDay: clampedDay}],
      totalAmount: inst.amount,
      firstDue: dueDate,
      firstUnpaid: {key: monthKey, y: nextY, m: nextM, dueDay: clampedDay},
      daysDiff: daysDiff,
      count: 1,
      isPast: false
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
  
  // 🔴 چند ماه عقب‌افتاده
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

/* ===== Card Modal ===== */
const CARD_COLORS=['#dc2626','#2563eb','#059669','#7c3aed','#db2777','#ea580c','#0891b2','#65a30d'];
const newCardBalanceEl = $('newCardBalance');
if(newCardBalanceEl){
  newCardBalanceEl.addEventListener('input',e=>{
    const f=fmtNumInput(e.target.value); e.target.value=f;
    const n=parseAmount(f);
    const w = $('newCardWords'); if(w) w.textContent = n ? numberToPersianWords(n)+' تومان' : '';
  });
}
const cardCancelEl = $('cardCancel');
if(cardCancelEl) cardCancelEl.addEventListener('click',()=>{ const co = $('cardOverlay'); if(co) co.classList.remove('open'); });
const cardOverlayEl = $('cardOverlay');
if(cardOverlayEl) cardOverlayEl.addEventListener('click',e=>{ if(e.target===cardOverlayEl) cardOverlayEl.classList.remove('open'); });
const cardOkEl = $('cardOk');
if(cardOkEl){
  cardOkEl.addEventListener('click',()=>{
    const name=$('newCardName').value.trim();
    const balance=parseAmount($('newCardBalance').value);
    if(!name){ showToast('نام کارت را وارد کن','error'); return; }
    if(state.editingCardId){
      const acc=findAccount(state.editingCardId);
      if(acc){ acc.name=name; acc.initialBalance=balance; }
      saveData();
      const co = $('cardOverlay'); if(co) co.classList.remove('open');
      renderSettings(); renderDashboard(); showToast('✅ ویرایش شد');
    } else if(state.data.settings.setupDone){
      state.data.accounts.push({id:uid(),name,color:CARD_COLORS[state.data.accounts.length%CARD_COLORS.length],initialBalance:balance});
      saveData();
      const co = $('cardOverlay'); if(co) co.classList.remove('open');
      renderSettings(); renderDashboard(); showToast('✅ اضافه شد');
    } else {
      state.setupCards.push({id:uid(),name,color:CARD_COLORS[state.setupCards.length%CARD_COLORS.length],initialBalance:balance});
      const co = $('cardOverlay'); if(co) co.classList.remove('open');
      renderSetup();
    }
  });
}

/* ===== Quick Add ===== */
function openModal(){
  if(!state.data.accounts.length){ showToast('اول یک کارت اضافه کن','error'); switchTab('settings'); return; }
  state.form={type:'expense',amount:0,category:null,note:'',date:new Date(),accountId:''};
  const ai = $('amountInput'); if(ai) ai.value='';
  const ni = $('noteInput'); if(ni) ni.value='';
  const aw = $('amountWords'); if(aw) aw.textContent='';
  const cs = $('cardSelect'); if(cs) cs.classList.remove('error');
  updateDateBar(); updateTypeUI(); renderCardSelect(); renderQuickCategories(); updateSaveBtn();
  const mo = $('modalOverlay'); if(mo) mo.classList.add('open');
  const ms = $('modalSheet'); if(ms) ms.classList.add('open');
  setTimeout(()=>{ const ai2 = $('amountInput'); if(ai2) ai2.focus(); },300);
}
function closeModal(){
  const mo = $('modalOverlay'); if(mo) mo.classList.remove('open');
  const ms = $('modalSheet'); if(ms) ms.classList.remove('open');
}
function renderCardSelect(){
  const cs = $('cardSelect'); if(!cs) return;
  cs.innerHTML = '<option value="">— انتخاب کارت —</option>' + state.data.accounts.map(a=>{
    const bal=getAccountBalance(a.id);
    return `<option value="${a.id}">${a.name} — ${fmtMoney(bal)}</option>`;
  }).join('');
  cs.value = state.form.accountId || '';
  const ch = $('cardHint');
  if(ch){
    if(!state.form.accountId){ ch.innerHTML = ''; }
    else { const bal=getAccountBalance(state.form.accountId); ch.innerHTML = `موجودی: <b>${fmtMoney(bal)}</b>`; }
  }
}
function updateTypeUI(){
  const isExp=state.form.type==='expense';
  const be = $('btnExpense'); if(be) be.classList.toggle('active',isExp);
  const bi = $('btnIncome'); if(bi) bi.classList.toggle('active',!isExp);
  const bs = $('btnSave'); if(bs){ bs.classList.toggle('income',!isExp); bs.textContent = isExp?'ثبت هزینه':'افزایش موجودی'; }
  const aw = $('amountWrap'); if(aw) aw.classList.toggle('income',!isExp);
  const cst = $('catSectionTitle'); if(cst) cst.textContent = isExp?'🍽️ چی خریدی؟':'💵 چرا اضافه شد؟';
  const qat = $('quickAddTitle'); if(qat) qat.textContent = isExp?'ثبت هزینه':'افزایش موجودی';
}
function updateDateBar(){
  const db = $('dateBarValue');
  if(db) db.textContent = relativeDateLabel(state.form.date)+' — '+fmtTime(state.form.date);
}
function renderQuickCategories(){
  const list=state.data.categories[state.form.type]||[];
  const clq = $('catListQuick');
  const csm = $('catSelectMobile');
  if(!list.length){
    if(clq) clq.innerHTML='<div class="empty-mini">دسته‌ای نیست</div>';
    if(csm) csm.innerHTML='<option>دسته‌ای نیست</option>';
    return;
  }
  if(clq){
    clq.innerHTML = list.map(c=>`
      <button class="cat-row ${state.form.category===c.id?'selected':''}" data-cat="${c.id}" style="--cat-color:${c.color}">
        <span class="em">${c.emoji}</span><span class="nm">${c.name}</span>
      </button>`).join('');
    clq.querySelectorAll('.cat-row').forEach(b=>{
      b.addEventListener('click',()=>{ state.form.category=b.dataset.cat; renderQuickCategories(); updateSaveBtn(); });
    });
  }
  if(csm){
    csm.innerHTML = '<option value="">— انتخاب دسته —</option>' + list.map(c=>`
      <option value="${c.id}" ${state.form.category===c.id?'selected':''}>${c.emoji} ${c.name}</option>`).join('');
  }
}
function updateSaveBtn(){
  const bs = $('btnSave');
  if(bs) bs.disabled = !(state.form.amount>0 && state.form.category && state.form.accountId);
}

function openDatePicker(target='form'){
  const d = target==='form'?state.form.date:(target==='pay'?state.payDate:(state.editForm.date||new Date()));
  const j = toJalaliParts(d);
  state.dp={year:j.y,month:j.m,day:j.d,target};
  const dh = $('dpHour'); if(dh) dh.value=d.getHours();
  const dm = $('dpMin'); if(dm) dm.value=d.getMinutes();
  const {year,month,day}=state.dp;
  const names=['فروردین','اردیبهشت','خرداد','تیر','مرداد','شهریور','مهر','آبان','آذر','دی','بهمن','اسفند'];
  const dpt = $('dpTitle'); if(dpt) dpt.textContent = `${names[month-1]} ${toFa(year)}`;
  const daysInMonth = jalaliMonthLength(year,month);
  const firstG = jalaliToGregorian(year,month,1);
  const startDay = (firstG.getDay()+1)%7;
  let html='';
  for(let i=0;i<startDay;i++) html+='<div></div>';
  for(let dd=1;dd<=daysInMonth;dd++){
    const sel = dd===day;
    html+=`<button class="dp-day ${sel?'selected':''}" data-day="${dd}">${toFa(dd)}</button>`;
  }
  const dpd = $('dpDays');
  if(dpd){
    dpd.innerHTML=html;
    dpd.querySelectorAll('button[data-day]').forEach(b=>{
      b.addEventListener('click',()=>{ state.dp.day=+b.dataset.day; openDatePicker(target); });
    });
  }
  const dpo = $('dpOverlay'); if(dpo) dpo.classList.add('open');
}
function closeDatePicker(){ const dpo = $('dpOverlay'); if(dpo) dpo.classList.remove('open'); }

const dateBarEl = $('dateBar');
if(dateBarEl) dateBarEl.addEventListener('click',()=>openDatePicker('form'));
const dpCancelEl = $('dpCancel');
if(dpCancelEl) dpCancelEl.addEventListener('click',closeDatePicker);
const dpPrevEl = $('dpPrev');
if(dpPrevEl) dpPrevEl.addEventListener('click',()=>{ state.dp.month--; if(state.dp.month<1){state.dp.month=12;state.dp.year--;} openDatePicker(state.dp.target); });
const dpNextEl = $('dpNext');
if(dpNextEl) dpNextEl.addEventListener('click',()=>{ state.dp.month++; if(state.dp.month>12){state.dp.month=1;state.dp.year++;} openDatePicker(state.dp.target); });
const dpOkEl = $('dpOk');
if(dpOkEl){
  dpOkEl.addEventListener('click',()=>{
    const g=jalaliToGregorian(state.dp.year,state.dp.month,state.dp.day);
    const dh = $('dpHour'); const dm = $('dpMin');
    g.setHours(+(dh?dh.value:0)||0,+(dm?dm.value:0)||0,0,0);
    if(state.dp.target==='form'){ state.form.date=g; updateDateBar(); }
    else if(state.dp.target==='edit'){ state.editForm.date=g; const ed = $('editDateValue'); if(ed) ed.textContent=relativeDateLabel(g)+' — '+fmtTime(g); }
    else if(state.dp.target==='pay'){ state.payDate=g; const pdv = $('payDateValue'); if(pdv) pdv.textContent=relativeDateLabel(g)+' — '+fmtTime(g); }
    closeDatePicker();
  });
}
const dpOverlayEl = $('dpOverlay');
if(dpOverlayEl) dpOverlayEl.addEventListener('click',e=>{ if(e.target===dpOverlayEl) closeDatePicker(); });

const amountInputEl = $('amountInput');
if(amountInputEl){
  amountInputEl.addEventListener('input',e=>{
    const f=fmtNumInput(e.target.value); e.target.value=f;
    state.form.amount=parseAmount(f);
    const aw = $('amountWords'); if(aw) aw.textContent = state.form.amount ? numberToPersianWords(state.form.amount)+' تومان' : '';
    updateSaveBtn();
  });
}
document.querySelectorAll('.quick-chip').forEach(chip=>{
  chip.addEventListener('click',()=>{
    state.form.amount=Number(chip.dataset.amount);
    const ai = $('amountInput'); if(ai) ai.value=state.form.amount.toLocaleString('en-US');
    const aw = $('amountWords'); if(aw) aw.textContent=numberToPersianWords(state.form.amount)+' تومان';
    updateSaveBtn();
  });
});
const btnExpenseEl = $('btnExpense');
if(btnExpenseEl) btnExpenseEl.addEventListener('click',()=>{ state.form.type='expense'; state.form.category=null; updateTypeUI(); renderQuickCategories(); updateSaveBtn(); });
const btnIncomeEl = $('btnIncome');
if(btnIncomeEl) btnIncomeEl.addEventListener('click',()=>{ state.form.type='income'; state.form.category=null; updateTypeUI(); renderQuickCategories(); updateSaveBtn(); });
const noteInputEl = $('noteInput');
if(noteInputEl) noteInputEl.addEventListener('input',e=>{ state.form.note=e.target.value; });
const modalOverlayEl = $('modalOverlay');
if(modalOverlayEl) modalOverlayEl.addEventListener('click',closeModal);
const cardSelectEl = $('cardSelect');
if(cardSelectEl){
  cardSelectEl.addEventListener('change',e=>{
    state.form.accountId=e.target.value;
    if(e.target.value) e.target.classList.remove('error');
    const ch = $('cardHint');
    if(ch){
      if(e.target.value){ const bal=getAccountBalance(e.target.value); ch.innerHTML = `موجودی: <b>${fmtMoney(bal)}</b>`; }
      else { ch.innerHTML = ''; }
    }
    updateSaveBtn();
  });
}
const catSelectMobileEl = $('catSelectMobile');
if(catSelectMobileEl) catSelectMobileEl.addEventListener('change',e=>{ state.form.category = e.target.value || null; updateSaveBtn(); });
const btnSaveEl = $('btnSave');
if(btnSaveEl){
  btnSaveEl.addEventListener('click',()=>{
    if(!state.form.accountId){
      const cs = $('cardSelect'); if(cs) cs.classList.add('error');
      showToast('لطفاً یک کارت انتخاب کن','error');
      return;
    }
    if(!(state.form.amount>0 && state.form.category && state.form.accountId)) return;
    if(state.form.type==='expense'){
      const bal=getAccountBalance(state.form.accountId);
      if(state.form.amount > bal){
        showToast(`⛔ موجودی کافی نیست! موجودی: ${fmtMoney(bal)}`,'error');
        return;
      }
    }
    state.data.transactions.push({
      id:uid(), type:state.form.type, amount:state.form.amount,
      category:state.form.category, accountId:state.form.accountId,
      note:(state.form.note||'').trim(), date:state.form.date.toISOString()
    });
    saveData(); closeModal();
    showToast(state.form.type==='expense'?'✅ هزینه ثبت شد':'✅ به کارت اضافه شد');
    if(state.activeTab==='dashboard') renderDashboard();
  });
}
const fabEl = $('fab');
if(fabEl) fabEl.addEventListener('click',openModal);

/* ===== Dashboard ===== */
function renderDashboard(){
  const dt = $('dashTotal'); if(dt) dt.textContent=fmtMoney(getTotalBalance());
  const cardsEl=$('dashCards');
  if(cardsEl){
    if(!state.data.accounts.length){ cardsEl.innerHTML='<div class="empty-mini">هنوز کارتی نداری</div>'; }
    else {
      cardsEl.innerHTML=state.data.accounts.map(a=>{
        const bal=getAccountBalance(a.id);
        return `<div class="card-account" style="margin-bottom:6px">
          <div class="acc-icon" style="background:${a.color}">${a.name.slice(0,2)}</div>
          <div class="acc-info"><div class="acc-name">${a.name}</div><div class="acc-balance num">${fmtMoney(bal)}</div></div>
        </div>`;
      }).join('');
    }
  }
  const cb = $('cardsBadge'); if(cb) cb.textContent = toFa(state.data.accounts.length);

  const instEl=$('dashInst');
  const ib = $('instBadge'); if(ib) ib.textContent = toFa(state.data.installments.length);
  if(instEl){
    if(!state.data.installments.length){
      instEl.innerHTML = '<div class="empty-mini">هنوز قسطی نداری</div>';
    } else {
      const items = state.data.installments.map(i=>({inst:i, disp:getInstallmentDisplay(i)}));
      const danger = items.filter(x=>x.disp.status==='danger');
      const warn = items.filter(x=>x.disp.status==='warn');
      const ok = items.filter(x=>x.disp.status==='ok');
      const paid = items.filter(x=>x.disp.status==='paid');
      let html = '';
      if(danger.length){
        html += `<div style="margin-bottom:8px"><span style="font-weight:800;color:#dc2626;font-size:12.5px">🔴 عقب‌افتاده (${toFa(danger.length)})</span></div>`;
        danger.forEach(({inst,disp})=>{
          html += `<div style="padding:8px 10px;border-radius:10px;background:#fef2f2;border:1px solid #fca5a5;margin-bottom:6px">
            <div style="display:flex;justify-content:space-between;align-items:center">
              <span style="font-size:13px;font-weight:700;color:#7f1d1d">${inst.name}</span>
              <span class="num" style="font-size:12.5px;font-weight:700;color:#dc2626">${fmtMoney(disp.totalAmount)}</span>
            </div>
            <div style="font-size:10.5px;color:#dc2626;margin-top:2px">${disp.meta}</div>
          </div>`;
        });
      }
      if(warn.length){
        html += `<div style="margin-bottom:8px"><span style="font-weight:800;color:#f59e0b;font-size:12.5px">⏰ نزدیک (${toFa(warn.length)})</span></div>`;
        warn.forEach(({inst,disp})=>{
          html += `<div style="padding:8px 10px;border-radius:10px;background:#fffbeb;border:1px solid #fcd34d;margin-bottom:6px">
            <div style="display:flex;justify-content:space-between;align-items:center">
              <span style="font-size:13px;font-weight:700;color:#78350f">${inst.name}</span>
              <span class="num" style="font-size:12.5px;font-weight:700;color:#f59e0b">${fmtMoney(disp.totalAmount)}</span>
            </div>
            <div style="font-size:10.5px;color:#f59e0b;margin-top:2px">${disp.meta}</div>
          </div>`;
        });
      }
      if(ok.length){
        html += `<div style="margin-bottom:8px"><span style="font-weight:800;color:#3b82f6;font-size:12.5px">📅 سر وقت (${toFa(ok.length)})</span></div>`;
        ok.forEach(({inst,disp})=>{
          html += `<div style="padding:8px 10px;border-radius:10px;background:#eff6ff;border:1px solid #93c5fd;margin-bottom:6px">
            <div style="display:flex;justify-content:space-between;align-items:center">
              <span style="font-size:13px;font-weight:600;color:#1e40af">${inst.name}</span>
              <span class="num" style="font-size:12.5px;font-weight:700;color:#3b82f6">${fmtMoney(disp.totalAmount)}</span>
            </div>
            <div style="font-size:10.5px;color:#3b82f6;margin-top:2px">${disp.meta}</div>
          </div>`;
        });
      }
      if(paid.length){
        html += `<div style="margin-bottom:8px;margin-top:10px"><span style="font-weight:800;color:#10b981;font-size:12.5px">✅ پرداخت‌شده (${toFa(paid.length)})</span></div>`;
        paid.forEach(({inst})=>{
          html += `<div style="padding:8px 10px;border-radius:10px;background:#f0fdf4;border:1px solid #86efac;margin-bottom:6px;opacity:.7">
            <div style="display:flex;justify-content:space-between;align-items:center">
              <span style="font-size:13px;font-weight:600;color:#166534;text-decoration:line-through">${inst.name}</span>
              <span class="num" style="font-size:12.5px;font-weight:600;color:#10b981;text-decoration:line-through">${fmtMoney(inst.amount)}</span>
            </div>
          </div>`;
        });
      }
      instEl.innerHTML = html;
    }
  }

  const alertEl=$('dashAlert');
  const pendingInsts = state.data.installments.filter(i=>{
    const d = getInstallmentDisplay(i);
    return d.status==='danger' || d.status==='warn';
  });
  const dangerInsts = pendingInsts.filter(i=>getInstallmentDisplay(i).status==='danger');
  const warnInsts = pendingInsts.filter(i=>getInstallmentDisplay(i).status==='warn');
  if(alertEl){
    if(dangerInsts.length || warnInsts.length){
      let html = '<div class="card" style="background:#fef2f2;border-color:#fca5a5">';
      if(dangerInsts.length) html += `<div style="font-weight:800;color:#dc2626;font-size:13.5px;margin-bottom:6px">🔴 ${toFa(dangerInsts.length)} قسط عقب‌افتاده!</div>`;
      if(warnInsts.length) html += `<div style="font-weight:800;color:#f59e0b;font-size:13.5px;margin:6px 0 6px">🟡 ${toFa(warnInsts.length)} قسط نزدیک</div>`;
      html += '<button onclick="switchTab(\'installments\')" class="btn-soft" style="margin-top:8px;background:#dc2626;color:white;font-size:12px;padding:8px">مشاهده اقساط</button></div>';
      alertEl.innerHTML = html;
    } else { alertEl.innerHTML = ''; }
  }

  const nowKey=jalaliMonthKey(); let exp=0;
  state.data.transactions.forEach(t=>{
    if(jalaliMonthKey(new Date(t.date))===nowKey && t.type==='expense') exp+=Number(t.amount)||0;
  });
  const de = $('dashExpense'); if(de) de.textContent=fmtMoney(exp);

  const recent=[...state.data.transactions].sort((a,b)=>new Date(b.date)-new Date(a.date)).slice(0,5);
  const dr = $('dashRecent');
  if(dr){
    if(!recent.length){ dr.innerHTML='<div class="empty-mini">هنوز تراکنشی نیست<br>دکمه + را بزن</div>'; }
    else {
      dr.innerHTML=recent.map(txHtml).join('');
      dr.querySelectorAll('.tx-item').forEach((el,i)=>{ el.addEventListener('click',()=>openEdit(recent[i].id)); });
    }
  }
}

function txHtml(t){
  const cat=findCategory(t.type,t.category); const acc=findAccount(t.accountId);
  const isInc=t.type==='income'; const d=new Date(t.date);
  return `<div class="tx-item">
    <div style="display:flex;align-items:center;gap:11px;min-width:0;flex:1">
      <div class="tx-icon" style="background:${cat?cat.color+'25':'#f1f5f9'}">${cat?cat.emoji:'📦'}</div>
      <div style="min-width:0;flex:1">
        <p style="margin:0;font-size:13.5px;font-weight:600;color:#334155;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" class="dark:text-slate-200">${t.note||(cat?cat.name:'تراکنش')}</p>
        <p style="margin:2px 0 0;font-size:10.5px;color:#94a3b8">${cat?cat.name+' • ':''}${acc?acc.name+' • ':''}${relativeDateLabel(d)} • ${fmtTime(d)}</p>
      </div>
    </div>
    <p class="tx-amount num ${isInc?'income':'expense'}" style="margin:0">${isInc?'+':'−'}${fmtMoney(t.amount)}</p>
  </div>`;
}

/* ===== Transactions ===== */
function buildMonthsList(){
  const set=new Set(); state.data.transactions.forEach(t=>set.add(jalaliMonthKey(new Date(t.date))));
  const arr=[...set].sort().reverse();
  const mf = $('monthFilter');
  if(!mf) return;
  mf.innerHTML = `<button class="filter-chip ${state.filters.month==='all'?'active':''}" data-month="all">همه</button>` +
    arr.map(m=>`<button class="filter-chip ${state.filters.month===m?'active':''}" data-month="${m}">${jalaliMonthName(m)}</button>`).join('');
  mf.querySelectorAll('.filter-chip').forEach(b=>{
    b.addEventListener('click',()=>{ state.filters.month=b.dataset.month; renderTransactions(); });
  });
}
document.querySelectorAll('#typeFilter .filter-chip').forEach(b=>{
  b.addEventListener('click',()=>{
    state.filters.type=b.dataset.type;
    document.querySelectorAll('#typeFilter .filter-chip').forEach(x=>x.classList.remove('active'));
    b.classList.add('active'); renderTransactions();
  });
});
function renderTransactions(){
  buildMonthsList();
  const tst = $('txStatTotal'); if(tst) tst.textContent=fmtMoneyShort(getTotalBalance());
  const pendingInsts = state.data.installments.filter(i=>{
    const d = getInstallmentDisplay(i);
    return d.status!=='paid';
  });
  const tsi = $('txStatInst');
  if(tsi) tsi.textContent = fmtMoneyShort(pendingInsts.reduce((s,i)=>{
    const d = getInstallmentDisplay(i);
    return s + (d.totalAmount||0);
  },0));
  let list=[...state.data.transactions];
  if(state.filters.type!=='all') list=list.filter(t=>t.type===state.filters.type);
  if(state.filters.month!=='all') list=list.filter(t=>jalaliMonthKey(new Date(t.date))===state.filters.month);
  let exp=0; list.forEach(t=>{ if(t.type==='expense') exp+=t.amount; });
  const tse = $('txStatExpense'); if(tse) tse.textContent=fmtMoneyShort(exp);
  list.sort((a,b)=>new Date(b.date)-new Date(a.date));
  const tl = $('txList');
  if(!tl) return;
  if(!list.length){ tl.innerHTML='<div class="empty-mini" style="padding:60px 20px">تراکنشی نیست</div>'; return; }
  tl.innerHTML='<div class="card">'+list.map(txHtml).join('')+'</div>';
  tl.querySelectorAll('.tx-item').forEach((el,i)=>{ el.addEventListener('click',()=>openEdit(list[i].id)); });
}

/* ===== Installments ===== */
function renderInstallments(){
  const list = state.data.installments;
  const items = list.map(i=>({inst:i, disp:getInstallmentDisplay(i)}));
  const totalMonth = items.reduce((s,x)=>s+(x.disp.status!=='paid'?x.disp.totalAmount:0),0);
  const imt = $('instMonthTotal'); if(imt) imt.textContent = fmtMoney(totalMonth);
  const paidTotal = items.filter(x=>x.disp.status==='paid').reduce((s,x)=>s+x.inst.amount,0);
  const ipt = $('instPaidTotal'); if(ipt) ipt.textContent = fmtMoney(paidTotal);
  const el = $('instList');
  if(!el) return;
  if(!list.length){ el.innerHTML = '<div class="empty-mini">هنوز قسطی ثبت نکردی<br>دکمه زیر رو بزن</div>'; return; }
  const sorted = [...items].sort((a,b)=>{
    const order = {danger:0, warn:1, ok:2, paid:3};
    return order[a.disp.status] - order[b.disp.status];
  });
  el.innerHTML = sorted.map(({inst, disp})=>{
    const status = disp.status;
    const card = findAccount(inst.cardId);
    let badge = ''; let meta = ''; let amount = fmtMoney(inst.amount);
    if(status==='paid'){
      badge = '<span class="inst-badge badge-paid">✓ این ماه پرداخت شد</span>';
      meta = card ? `کارت: ${card.name}` : '';
    } else if(status==='danger'){
      badge = disp.count > 1
        ? `<span class="inst-badge badge-danger">🚨 ×${toFa(disp.count)} عقب‌افتاده</span>`
        : '<span class="inst-badge badge-danger">🚨 عقب‌افتاده</span>';
      meta = disp.meta;
      amount = fmtMoney(disp.totalAmount);
    } else if(status==='warn'){
      badge = '<span class="inst-badge badge-warn">⏰ نزدیک</span>';
      meta = disp.meta;
      amount = fmtMoney(disp.totalAmount);
    } else {
      badge = '<span class="inst-badge badge-ok">📅 سر وقت</span>';
      meta = disp.meta;
      amount = fmtMoney(disp.totalAmount);
    }
    return `<div class="inst-item ${status}">
      <div class="inst-header">
        <div><span class="inst-name">${inst.name}</span>${badge}</div>
        <div class="inst-amount num">${amount}</div>
      </div>
      <div class="inst-meta">${meta}</div>
      <div class="inst-actions">
        ${status!=='paid'?`<button class="inst-btn inst-pay" data-pay="${inst.id}">💳 پرداخت</button>`:''}
        <button class="inst-btn inst-edit" data-edit="${inst.id}">✎ ویرایش</button>
        <button class="inst-btn inst-del" data-del="${inst.id}">✕ حذف</button>
      </div>
    </div>`;
  }).join('');
  el.querySelectorAll('[data-pay]').forEach(b=>b.addEventListener('click',()=>openPayModal(b.dataset.pay)));
  el.querySelectorAll('[data-edit]').forEach(b=>b.addEventListener('click',()=>openInstModal(b.dataset.edit)));
  el.querySelectorAll('[data-del]').forEach(b=>{
    b.addEventListener('click',()=>{
      if(!confirm('این قسط حذف شود؟')) return;
      state.data.installments = state.data.installments.filter(x=>x.id!==b.dataset.del);
      saveData(); renderInstallments(); renderDashboard(); showToast('حذف شد');
    });
  });
}

function openInstModal(id=null){
  state.editingInstId = id;
  if(id){
    const inst = state.data.installments.find(x=>x.id===id); if(!inst) return;
    const mt = $('instModalTitle'); if(mt) mt.textContent = 'ویرایش قسط';
    const ni = $('instName'); if(ni) ni.value = inst.name;
    const na = $('instAmount'); if(na) na.value = Number(inst.amount).toLocaleString('en-US');
    const nw = $('instWords'); if(nw) nw.textContent = numberToPersianWords(inst.amount)+' تومان';
    const nd = $('instDay'); if(nd) nd.value = inst.day;
  } else {
    const mt = $('instModalTitle'); if(mt) mt.textContent = 'افزودن قسط';
    const ni = $('instName'); if(ni) ni.value = '';
    const na = $('instAmount'); if(na) na.value = '';
    const nw = $('instWords'); if(nw) nw.textContent = '';
    const nd = $('instDay'); if(nd) nd.value = 1;
  }
  const ic = $('instCard');
  if(ic){
    ic.innerHTML = state.data.accounts.map(a=>`<option value="${a.id}">${a.name}</option>`).join('');
    if(id){ const inst = state.data.installments.find(x=>x.id===id); ic.value = inst.cardId || state.data.accounts[0]?.id; }
  }
  const io = $('instOverlay'); if(io) io.classList.add('open');
  setTimeout(()=>{ const ni2 = $('instName'); if(ni2) ni2.focus(); },300);
}
const btnAddInstEl = $('btnAddInst');
if(btnAddInstEl){
  btnAddInstEl.addEventListener('click',()=>{
    if(!state.data.accounts.length){ showToast('اول یک کارت اضافه کن','error'); return; }
    openInstModal(null);
  });
}
const instAmountEl = $('instAmount');
if(instAmountEl){
  instAmountEl.addEventListener('input',e=>{
    const f=fmtNumInput(e.target.value); e.target.value=f;
    const n=parseAmount(f);
    const iw = $('instWords'); if(iw) iw.textContent = n ? numberToPersianWords(n)+' تومان' : '';
  });
}
const instCancelEl = $('instCancel');
if(instCancelEl) instCancelEl.addEventListener('click',()=>{ const io = $('instOverlay'); if(io) io.classList.remove('open'); });
const instOverlayEl = $('instOverlay');
if(instOverlayEl) instOverlayEl.addEventListener('click',e=>{ if(e.target===instOverlayEl) instOverlayEl.classList.remove('open'); });
const instOkEl = $('instOk');
if(instOkEl){
  instOkEl.addEventListener('click',()=>{
    const name = $('instName').value.trim();
    const amount = parseAmount($('instAmount').value);
    const day = Math.max(1, Math.min(31, Number($('instDay').value)||1));
    const cardId = $('instCard').value;
    if(!name || !amount){ showToast('نام و مبلغ الزامی','error'); return; }
    if(state.editingInstId){
      const inst = state.data.installments.find(x=>x.id===state.editingInstId);
      if(inst){ inst.name=name; inst.amount=amount; inst.day=day; inst.cardId=cardId; }
      saveData();
      const io = $('instOverlay'); if(io) io.classList.remove('open');
      renderInstallments(); renderDashboard(); showToast('✅ ویرایش شد');
    } else {
      const now = new Date();
      const nowJ = toJalaliParts(now);
      const createdMonth = `${nowJ.y}-${String(nowJ.m).padStart(2,'0')}`;
      state.data.installments.push({
        id:uid(), name, amount, day, cardId,
        paidMonths:{}, paidDates:{},
        createdMonth
      });
      saveData();
      const io = $('instOverlay'); if(io) io.classList.remove('open');
      renderInstallments(); renderDashboard(); showToast('✅ اضافه شد');
    }
  });
}

function openPayModal(id){
  const inst = state.data.installments.find(x=>x.id===id); if(!inst) return;
  state.payInstId = id; state.payDate = new Date();
  const disp = getInstallmentDisplay(inst);
  const pt = $('payTitle'); if(pt) pt.textContent = '💳 پرداخت ' + inst.name;
  const ps = $('paySubtitle'); if(ps) ps.textContent = disp.count > 1 ? `شامل ${toFa(disp.count)} ماه پرداخت‌نشده` : `سررسید: روز ${toFa(inst.day)}`;
  const pa = $('payAmount'); if(pa) pa.textContent = fmtMoney(disp.totalAmount || inst.amount);
  const pcs = $('payCardSelect');
  if(pcs){
    pcs.innerHTML = '<option value="">— انتخاب کارت —</option>' + state.data.accounts.map(a=>{
      const bal=getAccountBalance(a.id);
      return `<option value="${a.id}">${a.name} — ${fmtMoney(bal)}</option>`;
    }).join('');
    pcs.value = inst.cardId || '';
    pcs.classList.remove('error');
  }
  const ph = $('payCardHint');
  if(ph){
    const bal = pcs && pcs.value ? getAccountBalance(pcs.value) : 0;
    ph.innerHTML = pcs && pcs.value ? `موجودی: <b>${fmtMoney(bal)}</b>` : '';
  }
  const pdv = $('payDateValue'); if(pdv) pdv.textContent = relativeDateLabel(state.payDate)+' — '+fmtTime(state.payDate);
  const po = $('payOverlay'); if(po) po.classList.add('open');
  const psh = $('paySheet'); if(psh) psh.classList.add('open');
}
function closePay(){
  const po = $('payOverlay'); if(po) po.classList.remove('open');
  const ps = $('paySheet'); if(ps) ps.classList.remove('open');
}
const payCardSelectEl = $('payCardSelect');
if(payCardSelectEl) payCardSelectEl.addEventListener('change',()=>{
  payCardSelectEl.classList.remove('error');
  const ph = $('payCardHint');
  if(ph){
    if(payCardSelectEl.value){ const bal = getAccountBalance(payCardSelectEl.value); ph.innerHTML = `موجودی: <b>${fmtMoney(bal)}</b>`; }
    else { ph.innerHTML = ''; }
  }
});
const payDateBarEl = $('payDateBar');
if(payDateBarEl) payDateBarEl.addEventListener('click',()=>openDatePicker('pay'));
const payOverlayEl = $('payOverlay');
if(payOverlayEl) payOverlayEl.addEventListener('click',closePay);
const payConfirmEl = $('payConfirm');
if(payConfirmEl){
  payConfirmEl.addEventListener('click',()=>{
    const inst = state.data.installments.find(x=>x.id===state.payInstId); if(!inst) return;
    const pcs = $('payCardSelect');
    const cardId = pcs ? pcs.value : '';
    if(!cardId){ if(pcs) pcs.classList.add('error'); showToast('لطفاً یک کارت انتخاب کن','error'); return; }
    const disp = getInstallmentDisplay(inst);
    const totalAmount = disp.totalAmount || inst.amount;
    const bal = getAccountBalance(cardId);
    if(totalAmount > bal){ showToast(`⛔ موجودی کافی نیست! موجودی: ${fmtMoney(bal)}`,'error'); return; }
    state.data.transactions.push({
      id:uid(), type:'expense', amount:totalAmount, category:'installment',
      accountId:cardId, note:`قسط: ${inst.name}${disp.count>1?` (×${disp.count})`:''}`,
      date:state.payDate.toISOString(), installmentId:inst.id
    });
    if(!inst.paidMonths) inst.paidMonths = {};
    if(!inst.paidDates) inst.paidDates = {};
    const mk = jalaliMonthKey(new Date(state.payDate));
    inst.paidMonths[mk] = true;
    inst.paidDates[mk] = state.payDate.toISOString();
    inst.paidCardId = cardId;
    saveData(); closePay();
    showToast('✅ قسط پرداخت شد');
    renderInstallments(); renderDashboard(); renderTransactions();
  });
}

/* ===== Plan ===== */
function initPlanMonth(){ if(!state.planMonth.y){ const j = toJalaliParts(new Date()); state.planMonth = {y:j.y, m:j.m}; } }
function renderPlan(){
  initPlanMonth();
  const {y,m} = state.planMonth;
  const pmt = $('planMonthTitle'); if(pmt) pmt.textContent = jalaliMonthName(`${y}-${String(m).padStart(2,'0')}`);
  const plan = getPlanForMonth(y,m);
  renderPlanList('income', plan.income, y, m);
  renderPlanList('expense', plan.expense, y, m);
  const incomeTotal = plan.income.reduce((s,i)=>s+(Number(i.amount)||0),0);
  const expenseTotal = plan.expense.reduce((s,i)=>s+(Number(i.amount)||0),0);
  const pit = $('planIncomeTotal'); if(pit) pit.textContent = fmtMoney(incomeTotal);
  const pet = $('planExpenseTotal'); if(pet) pet.textContent = fmtMoney(expenseTotal);
  const pb = $('planBalance'); if(pb) pb.textContent = fmtMoney(incomeTotal - expenseTotal);
  const monthKey = `${y}-${String(m).padStart(2,'0')}`;
  const actualIncome = state.data.transactions.filter(t=>t.type==='income' && jalaliMonthKey(new Date(t.date))===monthKey).reduce((s,t)=>s+Number(t.amount),0);
  const actualExpense = state.data.transactions.filter(t=>t.type==='expense' && jalaliMonthKey(new Date(t.date))===monthKey).reduce((s,t)=>s+Number(t.amount),0);
  const pie = $('planIncomeExpect'); if(pie) pie.textContent = fmtMoney(incomeTotal);
  const pia = $('planIncomeActual'); if(pia) pia.textContent = fmtMoney(actualIncome);
  const pee = $('planExpenseExpect'); if(pee) pee.textContent = fmtMoney(expenseTotal);
  const pea = $('planExpenseActual'); if(pea) pea.textContent = fmtMoney(actualExpense);
  const msgs = [];
  if(incomeTotal > 0){
    const diff = actualIncome - incomeTotal;
    if(diff > 0) msgs.push(`<div style="padding:10px;border-radius:10px;background:#f0fdf4;color:#16a34a;font-size:12.5px;font-weight:700;margin-top:8px">✅ ${fmtMoney(diff)} بیشتر از تخمین درآمد داشتی</div>`);
    else if(diff < 0) msgs.push(`<div style="padding:10px;border-radius:10px;background:#fffbeb;color:#f59e0b;font-size:12.5px;font-weight:700;margin-top:8px">⚠️ ${fmtMoney(-diff)} کمتر از تخمین درآمد داشتی</div>`);
  }
  if(expenseTotal > 0){
    const diff = actualExpense - expenseTotal;
    if(diff > 0) msgs.push(`<div style="padding:10px;border-radius:10px;background:#fef2f2;color:#dc2626;font-size:12.5px;font-weight:700;margin-top:8px">⚠️ ${fmtMoney(diff)} بیشتر از تخمین خرج کردی</div>`);
    else if(diff < 0) msgs.push(`<div style="padding:10px;border-radius:10px;background:#f0fdf4;color:#16a34a;font-size:12.5px;font-weight:700;margin-top:8px">✅ ${fmtMoney(-diff)} کمتر از تخمین خرج کردی</div>`);
    else msgs.push(`<div style="padding:10px;border-radius:10px;background:#eff6ff;color:#3b82f6;font-size:12.5px;font-weight:700;margin-top:8px">🎯 دقیقاً طبق تخمین خرج کردی!</div>`);
  }
  const pcr = $('planCompareResult'); if(pcr) pcr.innerHTML = msgs.join('');
}
function renderPlanList(type, list, y, m){
  const elId = type === 'income' ? 'planIncomeList' : 'planExpenseList';
  const el = $(elId);
  if(!el) return;
  if(!list.length){ el.innerHTML = `<div class="empty-mini">هنوز موردی اضافه نکردی</div>`; return; }
  el.innerHTML = list.map(item=>`
    <div class="plan-item ${item.done?'done':''}">
      <div class="plan-check" data-toggle="${item.id}" data-type="${type}">${item.done?'✓':''}</div>
      <div class="plan-text" data-edit="${item.id}" data-type="${type}">${item.text}</div>
      <div class="plan-amount num">${item.amount?fmtMoney(item.amount):'—'}</div>
    </div>`).join('');
  el.querySelectorAll('[data-toggle]').forEach(b=>{
    b.addEventListener('click',e=>{
      e.stopPropagation();
      const plan = getPlanForMonth(y,m);
      const item = plan[type].find(x=>x.id===b.dataset.toggle);
      if(item){ item.done = !item.done; savePlanForMonth(y,m,plan); saveData(); renderPlan(); }
    });
  });
  el.querySelectorAll('[data-edit]').forEach(b=>b.addEventListener('click',()=>openPlanModal(b.dataset.edit, b.dataset.type)));
}
const planPrevEl = $('planPrev');
if(planPrevEl) planPrevEl.addEventListener('click',()=>{ state.planMonth.m--; if(state.planMonth.m<1){ state.planMonth.m=12; state.planMonth.y--; } renderPlan(); });
const planNextEl = $('planNext');
if(planNextEl) planNextEl.addEventListener('click',()=>{ state.planMonth.m++; if(state.planMonth.m>12){ state.planMonth.m=1; state.planMonth.y++; } renderPlan(); });
function openPlanModal(id=null, type='expense'){
  state.editingPlanId = id; state.editingPlanType = type;
  const plan = getPlanForMonth(state.planMonth.y, state.planMonth.m);
  if(id){
    const item = plan[type].find(x=>x.id===id); if(!item) return;
    const pmt = $('planModalTitle'); if(pmt) pmt.textContent = type === 'income' ? '✏️ ویرایش درآمد' : '✏️ ویرایش هزینه';
    const pt = $('planText'); if(pt) pt.value = item.text;
    const pa = $('planAmount'); if(pa) pa.value = item.amount ? Number(item.amount).toLocaleString('en-US') : '';
    if(!$('planDeleteBtn')){
      const btn = document.createElement('button');
      btn.id = 'planDeleteBtn'; btn.className = 'btn-soft btn-danger'; btn.style.marginTop = '8px'; btn.textContent = '🗑️ حذف';
      btn.onclick = ()=>{
        const plan = getPlanForMonth(state.planMonth.y, state.planMonth.m);
        plan[type] = plan[type].filter(x=>x.id!==id);
        savePlanForMonth(state.planMonth.y, state.planMonth.m, plan);
        saveData(); const po = $('planOverlay'); if(po) po.classList.remove('open'); renderPlan(); showToast('حذف شد');
      };
      const po = $('planOverlay'); if(po) po.querySelector('.dp-box').appendChild(btn);
    }
  } else {
    const pmt = $('planModalTitle'); if(pmt) pmt.textContent = type === 'income' ? '➕ افزودن درآمد' : '➕ افزودن هزینه';
    const pt = $('planText'); if(pt) pt.value = '';
    const pa = $('planAmount'); if(pa) pa.value = '';
    const del = $('planDeleteBtn'); if(del) del.remove();
  }
  const po = $('planOverlay'); if(po) po.classList.add('open');
  setTimeout(()=>{ const pt2 = $('planText'); if(pt2) pt2.focus(); },300);
}
const btnAddPlanIncomeEl = $('btnAddPlanIncome');
if(btnAddPlanIncomeEl) btnAddPlanIncomeEl.addEventListener('click',()=>openPlanModal(null, 'income'));
const btnAddPlanExpenseEl = $('btnAddPlanExpense');
if(btnAddPlanExpenseEl) btnAddPlanExpenseEl.addEventListener('click',()=>openPlanModal(null, 'expense'));
const planCancelEl = $('planCancel');
if(planCancelEl) planCancelEl.addEventListener('click',()=>{ const po = $('planOverlay'); if(po) po.classList.remove('open'); });
const planOverlayEl = $('planOverlay');
if(planOverlayEl) planOverlayEl.addEventListener('click',e=>{ if(e.target===planOverlayEl) planOverlayEl.classList.remove('open'); });
const planAmountEl = $('planAmount');
if(planAmountEl) planAmountEl.addEventListener('input',e=>{ const f=fmtNumInput(e.target.value); e.target.value=f; });
const planOkEl = $('planOk');
if(planOkEl){
  planOkEl.addEventListener('click',()=>{
    const text = $('planText').value.trim();
    const amount = parseAmount($('planAmount').value);
    if(!text){ showToast('متن را وارد کن','error'); return; }
    const {y,m} = state.planMonth; const type = state.editingPlanType || 'expense';
    const plan = getPlanForMonth(y,m);
    if(state.editingPlanId){
      const item = plan[type].find(x=>x.id===state.editingPlanId);
      if(item){ item.text=text; item.amount=amount; }
    } else {
      plan[type].push({id:uid(), text, amount, done:false});
    }
    savePlanForMonth(y,m,plan); saveData();
    const po = $('planOverlay'); if(po) po.classList.remove('open'); renderPlan(); showToast('✅ ذخیره شد');
  });
}

/* ===== Edit ===== */
function openEdit(id){
  const t=state.data.transactions.find(x=>x.id===id); if(!t) return;
  state.editingTxId=id;
  state.editForm={type:t.type,amount:t.amount,category:t.category,note:t.note||'',date:new Date(t.date),accountId:t.accountId||''};
  const ea = $('editAmount'); if(ea) ea.value=Number(t.amount).toLocaleString('en-US');
  const eaw = $('editAmountWords'); if(eaw) eaw.textContent=numberToPersianWords(t.amount)+' تومان';
  const en = $('editNote'); if(en) en.value=t.note||'';
  const isExp=state.editForm.type==='expense';
  const be = $('editBtnExpense'); if(be) be.classList.toggle('active',isExp);
  const bi = $('editBtnIncome'); if(bi) bi.classList.toggle('active',!isExp);
  const aw = $('editAmountWrap'); if(aw) aw.classList.toggle('income',!isExp);
  const ed = $('editDateValue'); if(ed) ed.textContent=relativeDateLabel(state.editForm.date)+' — '+fmtTime(state.editForm.date);
  const ec = $('editCardSelect');
  if(ec){
    ec.innerHTML='<option value="">— انتخاب —</option>'+state.data.accounts.map(a=>`<option value="${a.id}">${a.name}</option>`).join('');
    ec.value=state.editForm.accountId || '';
  }
  const list=state.data.categories[state.editForm.type]||[];
  const ecl = $('editCatList');
  const ecsm = $('editCatSelectMobile');
  if(ecl){
    ecl.innerHTML=list.map(c=>`
      <button class="cat-row ${state.editForm.category===c.id?'selected':''}" data-cat="${c.id}" style="--cat-color:${c.color}">
        <span class="em">${c.emoji}</span><span class="nm">${c.name}</span>
      </button>`).join('');
    ecl.querySelectorAll('.cat-row').forEach(b=>{
      b.addEventListener('click',()=>{
        state.editForm.category=b.dataset.cat;
        ecl.querySelectorAll('.cat-row').forEach(x=>x.classList.remove('selected'));
        b.classList.add('selected');
      });
    });
  }
  if(ecsm){
    ecsm.innerHTML = '<option value="">— انتخاب —</option>' + list.map(c=>`
      <option value="${c.id}" ${state.editForm.category===c.id?'selected':''}>${c.emoji} ${c.name}</option>`).join('');
  }
  const eo = $('editOverlay'); if(eo) eo.classList.add('open');
  const es = $('editSheet'); if(es) es.classList.add('open');
}
function closeEdit(){
  const eo = $('editOverlay'); if(eo) eo.classList.remove('open');
  const es = $('editSheet'); if(es) es.classList.remove('open');
  state.editingTxId=null;
}
const editAmountEl = $('editAmount');
if(editAmountEl){
  editAmountEl.addEventListener('input',e=>{
    const f=fmtNumInput(e.target.value); e.target.value=f;
    state.editForm.amount=parseAmount(f);
    const eaw = $('editAmountWords'); if(eaw) eaw.textContent = state.editForm.amount ? numberToPersianWords(state.editForm.amount)+' تومان' : '';
  });
}
const editNoteEl = $('editNote');
if(editNoteEl) editNoteEl.addEventListener('input',e=>{ state.editForm.note=e.target.value; });
const editCardSelectEl = $('editCardSelect');
if(editCardSelectEl) editCardSelectEl.addEventListener('change',e=>{ state.editForm.accountId=e.target.value; });
const editBtnExpenseEl = $('editBtnExpense');
if(editBtnExpenseEl) editBtnExpenseEl.addEventListener('click',()=>{ state.editForm.type='expense'; state.editForm.category=null; const be = $('editBtnExpense'); if(be) be.classList.add('active'); const bi = $('editBtnIncome'); if(bi) bi.classList.remove('active'); const list=state.data.categories.expense||[]; const ecl=$('editCatList'); if(ecl){ ecl.innerHTML=list.map(c=>`<button class="cat-row" data-cat="${c.id}" style="--cat-color:${c.color}"><span class="em">${c.emoji}</span><span class="nm">${c.name}</span></button>`).join(''); ecl.querySelectorAll('.cat-row').forEach(b=>b.addEventListener('click',()=>{ state.editForm.category=b.dataset.cat; ecl.querySelectorAll('.cat-row').forEach(x=>x.classList.remove('selected')); b.classList.add('selected'); })); } });
const editBtnIncomeEl = $('editBtnIncome');
if(editBtnIncomeEl) editBtnIncomeEl.addEventListener('click',()=>{ state.editForm.type='income'; state.editForm.category=null; const bi = $('editBtnIncome'); if(bi) bi.classList.add('active'); const be = $('editBtnExpense'); if(be) be.classList.remove('active'); const list=state.data.categories.income||[]; const ecl=$('editCatList'); if(ecl){ ecl.innerHTML=list.map(c=>`<button class="cat-row" data-cat="${c.id}" style="--cat-color:${c.color}"><span class="em">${c.emoji}</span><span class="nm">${c.name}</span></button>`).join(''); ecl.querySelectorAll('.cat-row').forEach(b=>b.addEventListener('click',()=>{ state.editForm.category=b.dataset.cat; ecl.querySelectorAll('.cat-row').forEach(x=>x.classList.remove('selected')); b.classList.add('selected'); })); } });
const editDateBarEl = $('editDateBar');
if(editDateBarEl) editDateBarEl.addEventListener('click',()=>openDatePicker('edit'));
const editCancelEl = $('editCancel');
if(editCancelEl) editCancelEl.addEventListener('click',closeEdit);
const editOverlayEl = $('editOverlay');
if(editOverlayEl) editOverlayEl.addEventListener('click',closeEdit);
const editSaveEl = $('editSave');
if(editSaveEl){
  editSaveEl.addEventListener('click',()=>{
    const t=state.data.transactions.find(x=>x.id===state.editingTxId); if(!t) return;
    if(!(state.editForm.amount>0 && state.editForm.category)){ showToast('مبلغ و دسته الزامی','error'); return; }
    Object.assign(t,{
      type:state.editForm.type, amount:state.editForm.amount,
      category:state.editForm.category, note:(state.editForm.note||'').trim(),
      date:state.editForm.date.toISOString(), accountId:state.editForm.accountId
    });
    saveData(); closeEdit(); showToast('✅ ویرایش شد');
    renderTransactions(); renderDashboard();
  });
}
const editDeleteEl = $('editDelete');
if(editDeleteEl){
  editDeleteEl.addEventListener('click',()=>{
    if(!confirm('حذف شود؟')) return;
    state.data.transactions=state.data.transactions.filter(x=>x.id!==state.editingTxId);
    saveData(); closeEdit(); showToast('🗑️ حذف شد');
    renderTransactions(); renderDashboard();
  });
}
const editCatSelectMobileEl = $('editCatSelectMobile');
if(editCatSelectMobileEl) editCatSelectMobileEl.addEventListener('change',e=>{ state.editForm.category=e.target.value||null; });

/* ===== Reports ===== */
document.querySelectorAll('#reportPeriod .filter-chip').forEach(b=>{
  b.addEventListener('click',()=>{
    state.reportPeriod=b.dataset.period;
    document.querySelectorAll('#reportPeriod .filter-chip').forEach(x=>x.classList.remove('active'));
    b.classList.add('active'); renderReports();
  });
});
function getReportRange(period){
  const now=new Date(); const j=toJalaliParts(now);
  if(period==='month') return {period:'month',monthKey:jalaliMonthKey(now),label:'این ماه'};
  if(period==='prev-month'){ let m=j.m-1,y=j.y; if(m<1){m=12;y--;} return {period:'prev-month',monthKey:`${y}-${String(m).padStart(2,'0')}`,label:'ماه قبل'}; }
  if(period==='3month'){
    const keys=[]; let m=j.m,y=j.y;
    for(let i=0;i<3;i++){ keys.push(`${y}-${String(m).padStart(2,'0')}`); m--; if(m<1){m=12;y--;} }
    return {period:'3month',monthKeys:keys,label:'۳ ماه اخیر'};
  }
  if(period==='year') return {period:'year',year:j.y,label:'امسال'};
  return {period:'all',label:'همه'};
}
function isInRange(tx,range){
  const d=new Date(tx.date);
  if(range.period==='all') return true;
  if(range.period==='month' || range.period==='prev-month') return jalaliMonthKey(d)===range.monthKey;
  if(range.period==='3month') return range.monthKeys.includes(jalaliMonthKey(d));
  if(range.period==='year'){ const j=toJalaliParts(d); return j.y===range.year; }
  return true;
}
function renderReports(){
  try{
    const range=getReportRange(state.reportPeriod);
    const list=state.data.transactions.filter(t=>isInRange(t,range));
    let inc=0,exp=0; list.forEach(t=>{ if(t.type==='income') inc+=t.amount; else exp+=t.amount; });
    const lines=[];
    lines.push(`در <b>${range.label}</b> مجموعاً <b>${fmtMoney(exp)}</b> هزینه داشته‌اید.`);
    if(inc>0) lines.push(`و <b>${fmtMoney(inc)}</b> به کارت‌ها اضافه شده است.`);
    const catTotals={};
    list.filter(t=>t.type==='expense').forEach(t=>{ catTotals[t.category]=(catTotals[t.category]||0)+t.amount; });
    const sortedCats=Object.entries(catTotals).sort((a,b)=>b[1]-a[1]);
    if(sortedCats.length){
      const [tid,tv]=sortedCats[0]; const cat=findCategory('expense',tid);
      const pct=exp?Math.round(tv/exp*100):0;
      lines.push(`بیشترین هزینه: <b>${cat?cat.name:'—'}</b> با <b>${toFa(pct)}٪</b>.`);
    }
    const ra = $('reportAnalysis');
    if(ra) ra.innerHTML=`<div class="analysis-card"><h4>📊 تحلیل هوشمند</h4>${lines.map(l=>`<p>${l}</p>`).join('')}</div>`;
    const rs = $('reportSummary');
    if(rs) rs.innerHTML = `
      <div class="report-row"><span class="lbl">💳 موجودی کل</span><span class="val" style="color:#6366f1">${fmtMoney(getTotalBalance())}</span></div>
      <div class="report-row"><span class="lbl">📉 هزینه‌ها</span><span class="val" style="color:#ef4444">${fmtMoney(exp)}</span></div>
      ${inc>0?`<div class="report-row"><span class="lbl">➕ افزایش موجودی</span><span class="val" style="color:#10b981">${fmtMoney(inc)}</span></div>`:''}
      <div class="report-row"><span class="lbl">🔢 تعداد تراکنش‌ها</span><span class="val">${toFa(list.length)}</span></div>`;
    const catsEl=$('reportCats');
    if(catsEl){
      if(!sortedCats.length){ catsEl.innerHTML='<div class="empty-mini">هزینه‌ای در این بازه نیست</div>'; }
      else {
        const max = sortedCats[0][1];
        catsEl.innerHTML = sortedCats.map(([id,v])=>{
          const cat=findCategory('expense',id);
          const pct = max?Math.round(v/max*100):0;
          return `<div class="bar-row"><div class="bar-label"><span class="name">${cat?cat.emoji+' '+cat.name:id}</span><span class="amt num">${fmtMoney(v)}</span></div><div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${cat?cat.color:'#94a3b8'}"></div></div></div>`;
        }).join('');
      }
    }
    const top5=[...list].filter(t=>t.type==='expense').sort((a,b)=>b.amount-a.amount).slice(0,5);
    const rte = $('reportTopExpenses');
    if(rte){
      if(!top5.length){ rte.innerHTML='<div class="empty-mini">داده‌ای نیست</div>'; }
      else {
        rte.innerHTML=top5.map(txHtml).join('');
        rte.querySelectorAll('.tx-item').forEach((el,i)=>{ el.addEventListener('click',()=>openEdit(top5[i].id)); });
      }
    }
  }catch(e){ console.error('خطا در گزارش:', e); }
}

/* ===== Settings ===== */
function renderSettings(){
  const el=$('cardsManageList');
  if(el){
    if(!state.data.accounts.length){ el.innerHTML='<div class="empty-mini">هنوز کارتی نداری</div>'; }
    else {
      el.innerHTML=state.data.accounts.map(a=>{
        const bal=getAccountBalance(a.id);
        return `<div class="cat-manage-item">
          <div class="info">
            <div class="emoji-box" style="background:${a.color}">${a.name.slice(0,2)}</div>
            <div><div style="font-size:13.5px;font-weight:700;color:#334155" class="dark:text-slate-200">${a.name}</div><div style="font-size:11px;color:#94a3b8" class="num">${fmtMoney(bal)}</div></div>
          </div>
          <div style="display:flex;gap:6px">
            <button class="icon-mini icon-edit edit-acc" data-id="${a.id}">✎</button>
            <button class="icon-mini icon-del del-acc" data-id="${a.id}">✕</button>
          </div>
        </div>`;
      }).join('');
      el.querySelectorAll('.del-acc').forEach(b=>{
        b.addEventListener('click',()=>{
          const acc=findAccount(b.dataset.id); if(!acc) return;
          if(!confirm(`کارت «${acc.name}» حذف شود؟`)) return;
          state.data.transactions.forEach(t=>{ if(t.accountId===acc.id) t.accountId=null; });
          state.data.accounts=state.data.accounts.filter(a=>a.id!==acc.id);
          saveData(); renderSettings(); renderDashboard(); showToast('حذف شد');
        });
      });
      el.querySelectorAll('.edit-acc').forEach(b=>{
        b.addEventListener('click',()=>{
          const acc=findAccount(b.dataset.id); if(!acc) return;
          state.editingCardId=acc.id;
          const mt = $('cardModalTitle'); if(mt) mt.textContent='ویرایش کارت';
          const nc = $('newCardName'); if(nc) nc.value=acc.name;
          const nb = $('newCardBalance'); if(nb) nb.value=Number(acc.initialBalance).toLocaleString('en-US');
          const nw = $('newCardWords'); if(nw) nw.textContent=numberToPersianWords(acc.initialBalance)+' تومان';
          const co = $('cardOverlay'); if(co) co.classList.add('open');
        });
      });
    }
  }
  
  const catEl=$('catManageList');
  if(catEl){
    const list=state.data.categories[state.catManageType]||[];
    catEl.innerHTML=list.map(c=>`
      <div class="cat-manage-item">
        <div class="info">
          <div class="emoji-box" style="background:${c.color}25;color:${c.color}">${c.emoji}</div>
          <span style="font-size:14px;font-weight:600;color:#334155">${c.name}</span>
        </div>
        <button class="icon-mini icon-del del" data-id="${c.id}">✕</button>
      </div>`).join('');
    catEl.querySelectorAll('.del').forEach(b=>{
      b.addEventListener('click',()=>{
        if(!confirm('حذف شود؟')) return;
        state.data.categories[state.catManageType]=state.data.categories[state.catManageType].filter(c=>c.id!==b.dataset.id);
        saveData(); renderSettings(); showToast('حذف شد');
      });
    });
  }
  
  const scb = $('setCardsBadge'); if(scb) scb.textContent = toFa(state.data.accounts.length);
  const scatb = $('setCatsBadge'); if(scatb) scatb.textContent = toFa((state.data.categories.expense.length + state.data.categories.income.length));
  const rd = $('reminderDays'); if(rd) rd.value = state.data.settings.reminderDays||3;
  if(state.currentUser){ const ue = $('userEmail'); if(ue) ue.textContent = state.currentUser.email || ''; }
}

function checkNotifications(){
  if(!('Notification' in window) || Notification.permission !== 'granted') return;
  const today = new Date().toDateString();
  const lastNotif = localStorage.getItem('jib_last_notif');
  if(lastNotif === today) return;
  const pendingInsts = state.data.installments.filter(i=>{
    const d = getInstallmentDisplay(i);
    return d.status==='danger' || d.status==='warn';
  });
  if(pendingInsts.length){
    try { new Notification('جیب من — یادآوری اقساط', {body:`${pendingInsts.length} قسط نیاز به توجه داره`, tag:'jib-inst'}); localStorage.setItem('jib_last_notif', today); } catch(e){}
  }
}

document.querySelectorAll('#catTypeToggle .filter-chip').forEach(b=>{
  b.addEventListener('click',()=>{
    state.catManageType=b.dataset.ctype;
    document.querySelectorAll('#catTypeToggle .filter-chip').forEach(x=>x.classList.remove('active'));
    b.classList.add('active'); renderSettings();
  });
});

const btnAddCardEl = $('btnAddCard');
if(btnAddCardEl){
  btnAddCardEl.addEventListener('click',()=>{
    state.editingCardId=null;
    const mt = $('cardModalTitle'); if(mt) mt.textContent='افزودن کارت';
    const nc = $('newCardName'); if(nc) nc.value='';
    const nb = $('newCardBalance'); if(nb) nb.value='';
    const nw = $('newCardWords'); if(nw) nw.textContent='';
    const co = $('cardOverlay'); if(co) co.classList.add('open');
    setTimeout(()=>{ const nc2 = $('newCardName'); if(nc2) nc2.focus(); },300);
  });
}
const btnAddCatEl = $('btnAddCat');
if(btnAddCatEl){
  btnAddCatEl.addEventListener('click',()=>{
    const nc = $('newCatName'); if(nc) nc.value='';
    const ne = $('newCatEmoji'); if(ne) ne.value='';
    const co = $('catOverlay'); if(co) co.classList.add('open');
  });
}
const catCancelEl = $('catCancel');
if(catCancelEl) catCancelEl.addEventListener('click',()=>{ const co = $('catOverlay'); if(co) co.classList.remove('open'); });
const catOverlayEl = $('catOverlay');
if(catOverlayEl) catOverlayEl.addEventListener('click',e=>{ if(e.target===catOverlayEl) catOverlayEl.classList.remove('open'); });
const catOkEl = $('catOk');
if(catOkEl){
  catOkEl.addEventListener('click',()=>{
    const name=$('newCatName').value.trim();
    const emoji=$('newCatEmoji').value.trim()||'📦';
    if(!name){ showToast('نام را وارد کن','error'); return; }
    const colors=['#f97316','#10b981','#3b82f6','#8b5cf6','#ec4899','#06b6d4','#eab308','#14b8a6'];
    state.data.categories[state.catManageType].push({id:'c_'+uid(),name,emoji,color:colors[Math.floor(Math.random()*colors.length)]});
    saveData(); renderSettings();
    const co = $('catOverlay'); if(co) co.classList.remove('open'); showToast('✅ اضافه شد');
  });
}
const reminderDaysEl = $('reminderDays');
if(reminderDaysEl) reminderDaysEl.addEventListener('change',e=>{ state.data.settings.reminderDays = Number(e.target.value); saveData(); showToast('✅ ذخیره شد'); });
const bellToggleEl = $('bellToggle');
if(bellToggleEl){
  bellToggleEl.addEventListener('click',()=>{
    if(!('Notification' in window)){ showToast('مرورگرت پشتیبانی نمی‌کنه','error'); return; }
    if(Notification.permission === 'granted'){ showToast('اعلان‌ها فعال هستن 🔔'); new Notification('جیب من', {body:'اعلان‌ها فعالن! 🎉'}); }
    else if(Notification.permission === 'denied'){ showToast('اعلان‌ها رد شده','error'); }
    else {
      Notification.requestPermission().then(p=>{
        if(p === 'granted'){ state.data.settings.notifEnabled = true; saveData(); showToast('✅ اعلان‌ها فعال شد'); new Notification('جیب من', {body:'اعلان‌ها فعالن! 🎉'}); }
        else { showToast('رد شد','error'); }
      });
    }
  });
}
const btnEnableNotifEl = $('btnEnableNotif');
if(btnEnableNotifEl) btnEnableNotifEl.addEventListener('click',()=>{ if(bellToggleEl) bellToggleEl.click(); });

const btnBackupEl = $('btnBackup');
if(btnBackupEl){
  btnBackupEl.addEventListener('click',()=>{
    const blob=new Blob([JSON.stringify(state.data,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob); const a=document.createElement('a');
    a.href=url; a.download=`jib-man-${jalaliShort().replace(/\//g,'-')}.json`; a.click(); URL.revokeObjectURL(url);
    showToast('📥 دانلود شد');
  });
}
const btnRestoreEl = $('btnRestore');
if(btnRestoreEl) btnRestoreEl.addEventListener('click',()=>{ const rf = $('restoreFile'); if(rf) rf.click(); });
const restoreFileEl = $('restoreFile');
if(restoreFileEl){
  restoreFileEl.addEventListener('change',e=>{
    const file=e.target.files[0]; if(!file) return;
    const reader=new FileReader();
    reader.onload=ev=>{
      try{
        const data=JSON.parse(ev.target.result);
        if(!data.transactions||!data.categories) throw new Error('bad');
        if(!confirm('جایگزین شود؟')) return;
        state.data=Object.assign({},JSON.parse(JSON.stringify(defaultData)),data);
        saveData(); applyTheme(); renderDashboard(); renderTransactions(); renderInstallments(); renderPlan(); renderSettings();
        showToast('✅ بازیابی شد');
      }catch(err){ showToast('فایل نامعتبر','error'); }
    };
    reader.readAsText(file); e.target.value='';
  });
}
const btnCsvEl = $('btnCsv');
if(btnCsvEl){
  btnCsvEl.addEventListener('click',()=>{
    const rows=[['تاریخ','ساعت','نوع','دسته','کارت','مبلغ','توضیح']];
    state.data.transactions.forEach(t=>{
      const d=new Date(t.date); const c=findCategory(t.type,t.category); const a=findAccount(t.accountId);
      rows.push([jalaliShort(d),fmtTime(d),t.type==='income'?'افزایش موجودی':'هزینه',c?c.name:'—',a?a.name:'—',t.amount,(t.note||'').replace(/,/g,' ')]);
    });
    const csv='\uFEFF'+rows.map(r=>r.join(',')).join('\n');
    const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});
    const url=URL.createObjectURL(blob); const a=document.createElement('a');
    a.href=url; a.download=`jib-man-${jalaliShort().replace(/\//g,'-')}.csv`; a.click(); URL.revokeObjectURL(url);
    showToast('📊 دانلود شد');
  });
}
const btnWipeEl = $('btnWipe');
if(btnWipeEl){
  btnWipeEl.addEventListener('click',()=>{
    if(!confirm('همه داده‌ها حذف شوند؟')) return;
    state.data=JSON.parse(JSON.stringify(defaultData)); saveData(); location.reload();
  });
}

/* ===== Cloud Sync Buttons ===== */
const btnSyncNowEl = $('btnSyncNow');
if(btnSyncNowEl){
  btnSyncNowEl.addEventListener('click', async ()=>{
    if(!state.currentUser){ showToast('اول وارد شو','error'); return; }
    if(!navigator.onLine){ showToast('اینترنت وصل نیست','error'); return; }
    showToast('در حال سینک...');
    try{
      await uploadToCloud(state.data);
      showToast('✅ سینک انجام شد');
    }catch(e){ showToast('خطا در سینک','error'); }
  });
}
const btnPullCloudEl = $('btnPullCloud');
if(btnPullCloudEl){
  btnPullCloudEl.addEventListener('click', async ()=>{
    if(!state.currentUser){ showToast('اول وارد شو','error'); return; }
    if(!navigator.onLine){ showToast('اینترنت وصل نیست','error'); return; }
    if(!confirm('داده‌های محلی با داده‌های سرور جایگزین می‌شوند. مطمئنی؟')) return;
    showToast('در حال دریافت...');
    try{
      const cloud = await downloadFromCloud();
      state.data.accounts = cloud.accounts;
      state.data.transactions = cloud.transactions;
      state.data.installments = cloud.installments;
      state.data.plans = cloud.plans;
      if(cloud.categories) state.data.categories = cloud.categories;
      if(cloud.settings) state.data.settings = Object.assign(state.data.settings, cloud.settings);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.data));
      renderDashboard(); renderTransactions(); renderInstallments(); renderPlan(); renderSettings();
      showToast('✅ داده‌ها از سرور دریافت شد');
    }catch(e){ showToast('خطا در دریافت','error'); }
  });
}
const btnLogoutEl = $('btnLogout');
if(btnLogoutEl){
  btnLogoutEl.addEventListener('click', async ()=>{
    if(!confirm('از حساب خارج می‌شوی؟\n\n⚠️ داده‌های محلی پاک می‌شن')) return;
    if(typeof clearAllUserData === 'function') clearAllUserData();
    else {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem('jib_last_user_id');
    }
    state.data = JSON.parse(JSON.stringify(defaultData));
    try{ await signOut(); }catch(e){}
    state.currentUser = null;
    showAuthScreen();
    setAuthMode('login');
    const ae = $('authEmail'); if(ae) ae.value = '';
    const ap = $('authPassword'); if(ap) ap.value = '';
    showToast('✅ خارج شدی');
  });
}

/* ===== Init با Timeout ===== */
async function init(){
  console.log('🚀 شروع init');
  applyTheme();
  
  setTimeout(()=>{
    const s = $('splash');
    if(s){
      console.log('🎬 بستن splash');
      s.classList.add('hide');
      setTimeout(()=>{ if(s) s.remove(); }, 600);
    }
  }, 2000);
  
  const withTimeout = (promise, ms, label) => {
    return Promise.race([
      promise,
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error(`${label} timeout`)), ms)
      )
    ]);
  };
  
  try {
    console.log('📡 اتصال به Supabase...');
    await withTimeout(initSupabase(), 8000, 'initSupabase');
    console.log('✅ Supabase متصل شد');
    
    console.log('🔐 چک کردن لاگین...');
    const logged = await withTimeout(checkAuth(), 5000, 'checkAuth');
    console.log('✅ checkAuth:', logged);
    
    if(logged){
      const lastUserId = localStorage.getItem('jib_last_user_id');
      if(lastUserId && lastUserId !== currentUser.id){
        console.log('🔄 کاربر عوض شده');
        localStorage.removeItem(STORAGE_KEY);
        state.data = JSON.parse(JSON.stringify(defaultData));
      }
      localStorage.setItem('jib_last_user_id', currentUser.id);
      
      hideAuthScreen();
      console.log('📥 رفتن به onUserLoggedIn');
      setTimeout(onUserLoggedIn, 100);
    } else {
      console.log('👤 لاگین نیست → صفحه لاگین');
      showAuthScreen();
      setAuthMode('login');
    }
  } catch(e){
    console.error('❌ خطا در init:', e.message);
    console.log('⚠️ نمایش صفحه لاگین (به جای گیر کردن)');
    showAuthScreen();
    setAuthMode('login');
    if(e.message && e.message.includes('timeout')){
      showAuthError('اتصال به سرور برقرار نشد. VPN یا اینترنت را چک کن.');
    }
  }
  
  setInterval(checkNotifications, 30000);
  setTimeout(checkNotifications, 3000);
  console.log('✅ جیب من آماده شد');
}
init();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(()=>{}); });
}
