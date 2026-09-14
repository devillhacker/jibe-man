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

/* ===== Storage ===== */
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

/* ===== Auto Sync ===== */
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
          else {
            if(typeof updateSyncStatus === 'function') updateSyncStatus('offline');
            return;
          }
        } else { return; }
      } catch(e){ return; }
    }
    if(autoSyncLock) return;
    autoSyncLock = true;
    try{
      if(typeof uploadToCloud === 'function'){
        await uploadToCloud(state.data);
        console.log('✅ سینک خودکار (بعد تغییر)');
      }
    }catch(e){
      console.error('❌ خطا در سینک خودکار:', e);
      if(typeof updateSyncStatus === 'function') updateSyncStatus('pending');
    } finally { autoSyncLock = false; }
  }, 2000);
}

/* چک خودکار هر ۱ دقیقه */
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
        console.log('📥 سرور جدیدتره، دریافت...');
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
        console.log('✅ داده‌های جدید از سرور دریافت شد');
      }
    }
  } catch(e){ console.warn('چک خودکار خطا:', e); }
}, 60000);

/* تابع سینک دستی */
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

/* ===== Utilities ===== */
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
  const el=$('toast'); el.textContent=msg; el.className=type; el.style.opacity='1';
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

function toggleCollapsible(id){ $(id).classList.toggle('open'); }

/* ===== Installment Logic ===== */
function jalaliMonthLength(jy,jm){ if(jm<=6) return 31; if(jm<=11) return 30; return ((jy+12)%33)%4===0?30:29; }
function jalaliToGregorian(jy,jm,jd){
  const total = jdn(jy,jm,jd) - jdn(1,1,1);
  const b=new Date(622,2,21); b.setDate(b.getDate()+total); return b;
}
function jdn(jy,jm,jd){
  const epbase=jy-474; const epyear=474+(epbase%2820);
  return jd + (jm<=7?(jm-1)*31:(jm-1)*30+6)
    + Math.floor((epyear*682-110)/2816) + (epyear-1)*365
    + Math.floor(epbase/2820)*1029983 + 1948320;
}
function addJalaliMonths(jy, jm, n){
  let total = jy*12 + (jm-1) + n;
  return {y: Math.floor(total/12), m: (total%12)+1};
}
function compareJalali(y1,m1,d1, y2,m2,d2){
  if(y1!==y2) return y1-y2;
  if(m1!==m2) return m1-m2;
  return d1-d2;
}

function getInstStatus(inst){
  const now = new Date();
  const today = toJalaliParts(now);
  const todayCmp = today.y*10000 + today.m*100 + today.d;
  const paidMonths = Object.keys(inst.paidMonths||{});
  const createdKey = inst.createdMonth || jalaliMonthKey(now);
  const [cy, cm] = createdKey.split('-').map(Number);
  const months = [];
  let {y, m} = {y: cy, m: cm};
  while(compareJalali(y,m,1, today.y, today.m+1, 1) <= 0){
    const key = `${y}-${String(m).padStart(2,'0')}`;
    const dueDay = Math.min(inst.day, jalaliMonthLength(y,m));
    const dueCmp = y*10000 + m*100 + dueDay;
    if(dueCmp <= todayCmp){
      months.push({key, y, m, dueDay, dueCmp});
    }
    const next = addJalaliMonths(y,m,1);
    y = next.y; m = next.m;
  }
  const unpaid = months.filter(mo => !paidMonths.includes(mo.key));
  if(!unpaid.length){
    return {status:'paid', unpaidMonths:[], totalAmount:0, count:0};
  }
  const firstUnpaid = unpaid[0];
  const firstDueDate = jalaliToGregorian(firstUnpaid.y, firstUnpaid.m, firstUnpaid.dueDay);
  const daysDiff = Math.floor((new Date(firstDueDate).setHours(0,0,0,0) - new Date().setHours(0,0,0,0)) / 86400000);
  let status = 'danger';
  if(daysDiff >= 0 && daysDiff <= (state.data.settings.reminderDays||3)) status = 'warn';
  else if(daysDiff > (state.data.settings.reminderDays||3)) status = 'ok';
  return {
    status,
    unpaidMonths: unpaid,
    totalAmount: inst.amount * unpaid.length,
    firstDue: firstDueDate,
    firstUnpaid,
    daysDiff,
    count: unpaid.length
  };
}

function getInstallmentDisplay(inst){
  const info = getInstStatus(inst);
  if(info.unpaidMonths.length === 0){
    return { status:'paid', count:0, totalAmount:0, meta:'' };
  }
  const first = info.firstUnpaid;
  const today = toJalaliParts(new Date());
  const dueCmp = first.y*10000 + first.m*100 + first.dueDay;
  const todayCmp = today.y*10000 + today.m*100 + today.d;
  if(dueCmp >= todayCmp && first.y === today.y && first.m === today.m){
    return {
      status: 'ok',
      count: info.count,
      totalAmount: info.totalAmount,
      meta: `${toFa(first.dueDay)} ${jalaliMonthName(`${first.y}-${String(first.m).padStart(2,'0')}`)} — ${toFa(Math.abs(info.daysDiff))} روز دیگه`,
      dueDate: info.firstDue,
      unpaidMonths: info.unpaidMonths
    };
  }
  if(info.count > 1){
    return {
      status: 'danger',
      count: info.count,
      totalAmount: info.totalAmount,
      meta: `${toFa(info.count)} ماه پرداخت نشده`,
      dueDate: info.firstDue,
      unpaidMonths: info.unpaidMonths
    };
  }
  if(info.daysDiff < 0){
    return {
      status: 'danger',
      count: 1,
      totalAmount: info.totalAmount,
      meta: `${toFa(Math.abs(info.daysDiff))} روز از سررسید گذشته`,
      dueDate: info.firstDue,
      unpaidMonths: info.unpaidMonths
    };
  }
  return {
    status: 'warn',
    count: info.count,
    totalAmount: info.totalAmount,
    meta: `${toFa(info.daysDiff)} روز مونده`,
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

/* ===== Theme ===== */
function applyTheme(){
  const t=state.data.settings.theme||'light';
  document.body.classList.toggle('dark',t==='dark');
  $('themeToggle').textContent = t==='dark'?'☀️':'🌙';
}
$('themeToggle').addEventListener('click',()=>{
  state.data.settings.theme = state.data.settings.theme==='dark'?'light':'dark';
  saveData(); applyTheme();
});

function switchTab(tab){
  state.activeTab=tab;
  ['dashboard','transactions','installments','plan','reports','settings'].forEach(t=>$('tab-'+t).classList.add('hidden'));
  $('tab-'+tab).classList.remove('hidden');
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
$('settingsBtn').addEventListener('click',()=>switchTab('settings'));

/* ===== Auth UI ===== */
let authMode = 'login';

function showAuthScreen(){
  $('authScreen').classList.remove('hidden');
  $('setupScreen').classList.add('hidden');
  $('mainApp').classList.add('hidden');
}
function hideAuthScreen(){
  $('authScreen').classList.add('hidden');
}
function setAuthMode(mode){
  authMode = mode;
  const isLogin = mode === 'login';
  $('tabLogin').classList.toggle('active', isLogin);
  $('tabSignup').classList.toggle('active', !isLogin);
  $('authSubmit').textContent = isLogin ? 'ورود' : 'ثبت‌نام';
  $('authSubtitle').textContent = isLogin ? 'برای ادامه وارد شو' : 'حساب جدید بساز';
  $('authFooterText').textContent = isLogin ? 'حساب نداری؟' : 'حساب داری؟';
  $('authSwitch').textContent = isLogin ? 'ثبت‌نام کن' : 'وارد شو';
  $('authPassword').autocomplete = isLogin ? 'current-password' : 'new-password';
  hideAuthError();
}
function showAuthError(msg){
  const el = $('authError');
  el.textContent = msg;
  el.classList.remove('hidden');
}
function hideAuthError(){
  $('authError').classList.add('hidden');
}
$('tabLogin').addEventListener('click', ()=>setAuthMode('login'));
$('tabSignup').addEventListener('click', ()=>setAuthMode('signup'));
$('authSwitch').addEventListener('click', ()=>setAuthMode(authMode==='login'?'signup':'login'));

$('authForm').addEventListener('submit', async (e)=>{
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
      console.log('🔄 کاربر عوض شد! پاک کردن داده‌های محلی...');
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
async function onUserLoggedIn(){
  // 🔐 اول از session کاربر فعلی رو بگیر
  const realUserId = await getCurrentUserId();
  if(!realUserId){
    console.error('❌ کاربر لاگین نیست!');
    showAuthScreen();
    return;
  }
  
  // 🔐 کاربر فعلی رو ست کن
  state.currentUser = { id: realUserId, email: currentUser?.email || '' };
  $('userEmail').textContent = state.currentUser.email || '';
  
  // 🔐 چک کن کاربر عوض شده
  const lastUserKey = 'jib_last_user_id';
  const lastUserId = localStorage.getItem(lastUserKey);
  const userChanged = lastUserId && lastUserId !== realUserId;
  
  // 🔐 اگه کاربر عوض شده → localStorage رو کاملاً پاک کن
  if(userChanged){
    console.log('🔄 کاربر عوض شد! پاک کردن داده‌های محلی');
    state.data = JSON.parse(JSON.stringify(defaultData));
    localStorage.removeItem(STORAGE_KEY);
    showToast('کاربر عوض شد، داده‌های قبلی پاک شد');
  }
  
  // 🔐 کاربر فعلی رو ذخیره کن
  localStorage.setItem(lastUserKey, realUserId);
  
  // 🔐 همیشه از سرور بگیر (امن‌ترین روش)
  try{
    console.log('📥 دریافت داده‌های کاربر از سرور...');
    const cloud = await downloadFromCloud();
    
    state.data.accounts = cloud.accounts || [];
    state.data.transactions = cloud.transactions || [];
    state.data.installments = cloud.installments || [];
    state.data.plans = cloud.plans || {};
    if(cloud.categories) state.data.categories = cloud.categories;
    if(cloud.settings) state.data.settings = Object.assign(state.data.settings, cloud.settings);
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.data));
    
    if(cloud.accounts.length || cloud.transactions.length){
      showToast('✅ داده‌ها از سرور دریافت شد');
    }
  }catch(e){
    console.error('❌ خطا در دریافت:', e);
    showToast('خطا در اتصال به سرور');
  }

  // 🔐 رندر
  if(!state.data.settings.setupDone || !state.data.accounts.length){
    $('setupScreen').classList.remove('hidden');
    $('mainApp').classList.add('hidden');
    renderSetup();
  } else {
    enterMainApp();
  }
}

/* ===== Setup ===== */
function renderSetup(){
  const list=$('setupCardList');
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
  $('setupTotal').textContent = fmtMoney(state.setupCards.reduce((s,c)=>s+(Number(c.initialBalance)||0),0));
}
$('setupAddCard').addEventListener('click',()=>{
  state.editingCardId=null; $('cardModalTitle').textContent='افزودن کارت';
  $('newCardName').value=''; $('newCardBalance').value=''; $('newCardWords').textContent='';
  $('cardOverlay').classList.add('open'); setTimeout(()=>$('newCardName').focus(),300);
});

/* 🔐 خروج از حساب در صفحه setup */
async function logoutFromSetup(){
  if(!confirm('از حساب خارج می‌شوی؟\n\n⚠️ داده‌های محلی پاک می‌شن (ولی توی سرور می‌مونن)')) return;
  if(typeof clearAllUserData === 'function') clearAllUserData();
  else {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem('jib_last_user_id');
  }
  state.data = JSON.parse(JSON.stringify(defaultData));
  try{ await signOut(); }catch(e){}
  state.currentUser = null;
  $('setupScreen').classList.add('hidden');
  showAuthScreen();
  setAuthMode('login');
  $('authEmail').value = '';
  $('authPassword').value = '';
  showToast('✅ خارج شدی');
}
window.logoutFromSetup = logoutFromSetup;

$('setupDone').addEventListener('click',()=>{
  if(!state.setupCards.length){ showToast('حداقل یک کارت اضافه کن','error'); return; }
  state.data.accounts = state.setupCards.map(c=>({id:c.id||uid(),name:c.name,color:c.color,initialBalance:Number(c.initialBalance)||0}));
  state.data.settings.setupDone=true; saveData(); enterMainApp();
});
function enterMainApp(){
  $('setupScreen').classList.add('hidden'); $('mainApp').classList.remove('hidden');
  applyTheme(); $('headerDate').textContent = jalaliLong(); renderDashboard();
  if(state.currentUser){
    $('userEmail').textContent = state.currentUser.email || '';
    if(typeof updateSyncStatus === 'function') updateSyncStatus('online');
  }
}

/* ===== Card Modal ===== */
const CARD_COLORS=['#dc2626','#2563eb','#059669','#7c3aed','#db2777','#ea580c','#0891b2','#65a30d'];
$('newCardBalance').addEventListener('input',e=>{
  const f=fmtNumInput(e.target.value); e.target.value=f;
  const n=parseAmount(f);
  $('newCardWords').textContent = n ? numberToPersianWords(n)+' تومان' : '';
});
$('cardCancel').addEventListener('click',()=>$('cardOverlay').classList.remove('open'));
$('cardOverlay').addEventListener('click',e=>{ if(e.target===$('cardOverlay')) $('cardOverlay').classList.remove('open'); });
$('cardOk').addEventListener('click',()=>{
  const name=$('newCardName').value.trim();
  const balance=parseAmount($('newCardBalance').value);
  if(!name){ showToast('نام کارت را وارد کن','error'); return; }
  if(state.editingCardId){
    const acc=findAccount(state.editingCardId);
    if(acc){ acc.name=name; acc.initialBalance=balance; }
    saveData(); $('cardOverlay').classList.remove('open');
    renderSettings(); renderDashboard(); showToast('✅ ویرایش شد');
  } else if(state.data.settings.setupDone){
    state.data.accounts.push({id:uid(),name,color:CARD_COLORS[state.data.accounts.length%CARD_COLORS.length],initialBalance:balance});
    saveData(); $('cardOverlay').classList.remove('open');
    renderSettings(); renderDashboard(); showToast('✅ اضافه شد');
  } else {
    state.setupCards.push({id:uid(),name,color:CARD_COLORS[state.setupCards.length%CARD_COLORS.length],initialBalance:balance});
    $('cardOverlay').classList.remove('open'); renderSetup();
  }
});

/* ===== Quick Add ===== */
function openModal(){
  if(!state.data.accounts.length){ showToast('اول یک کارت اضافه کن','error'); switchTab('settings'); return; }
  state.form={type:'expense',amount:0,category:null,note:'',date:new Date(),accountId:''};
  $('amountInput').value=''; $('noteInput').value=''; $('amountWords').textContent='';
  $('cardSelect').classList.remove('error');
  updateDateBar(); updateTypeUI(); renderCardSelect(); renderQuickCategories(); updateSaveBtn();
  $('modalOverlay').classList.add('open'); $('modalSheet').classList.add('open');
  setTimeout(()=>$('amountInput').focus(),300);
}
function closeModal(){ $('modalOverlay').classList.remove('open'); $('modalSheet').classList.remove('open'); }
function renderCardSelect(){
  $('cardSelect').innerHTML = '<option value="">— انتخاب کارت —</option>' + state.data.accounts.map(a=>{
    const bal=getAccountBalance(a.id);
    return `<option value="${a.id}">${a.name} — ${fmtMoney(bal)}</option>`;
  }).join('');
  $('cardSelect').value = state.form.accountId || '';
  updateCardHint();
}
function updateCardHint(){
  if(!state.form.accountId){ $('cardHint').innerHTML = ''; return; }
  const bal=getAccountBalance(state.form.accountId);
  $('cardHint').innerHTML = `موجودی: <b>${fmtMoney(bal)}</b>`;
}
$('cardSelect').addEventListener('change',e=>{
  state.form.accountId=e.target.value;
  if(e.target.value) e.target.classList.remove('error');
  updateCardHint(); updateSaveBtn();
});
function updateTypeUI(){
  const isExp=state.form.type==='expense';
  $('btnExpense').classList.toggle('active',isExp);
  $('btnIncome').classList.toggle('active',!isExp);
  $('btnSave').classList.toggle('income',!isExp);
  $('amountWrap').classList.toggle('income',!isExp);
  $('btnSave').textContent = isExp?'ثبت هزینه':'افزایش موجودی';
  $('catSectionTitle').textContent = isExp?'🍽️ چی خریدی؟':'💵 چرا اضافه شد؟';
  $('quickAddTitle').textContent = isExp?'ثبت هزینه':'افزایش موجودی';
}
function updateDateBar(){ $('dateBarValue').textContent = relativeDateLabel(state.form.date)+' — '+fmtTime(state.form.date); }
function renderQuickCategories(){
  const list=state.data.categories[state.form.type]||[];
  if(!list.length){
    $('catListQuick').innerHTML='<div class="empty-mini">دسته‌ای نیست</div>';
    $('catSelectMobile').innerHTML='<option>دسته‌ای نیست</option>'; return;
  }
  $('catListQuick').innerHTML = list.map(c=>`
    <button class="cat-row ${state.form.category===c.id?'selected':''}" data-cat="${c.id}" style="--cat-color:${c.color}">
      <span class="em">${c.emoji}</span><span class="nm">${c.name}</span>
    </button>`).join('');
  $('catListQuick').querySelectorAll('.cat-row').forEach(b=>{
    b.addEventListener('click',()=>{ state.form.category=b.dataset.cat; renderQuickCategories(); updateSaveBtn(); });
  });
  $('catSelectMobile').innerHTML = '<option value="">— انتخاب دسته —</option>' + list.map(c=>`
    <option value="${c.id}" ${state.form.category===c.id?'selected':''}>${c.emoji} ${c.name}</option>`).join('');
}
$('catSelectMobile').addEventListener('change',e=>{ state.form.category = e.target.value || null; updateSaveBtn(); });
function updateSaveBtn(){ $('btnSave').disabled = !(state.form.amount>0 && state.form.category && state.form.accountId); }
$('amountInput').addEventListener('input',e=>{
  const f=fmtNumInput(e.target.value); e.target.value=f;
  state.form.amount=parseAmount(f);
  $('amountWords').textContent = state.form.amount ? numberToPersianWords(state.form.amount)+' تومان' : '';
  updateSaveBtn();
});
document.querySelectorAll('.quick-chip').forEach(chip=>{
  chip.addEventListener('click',()=>{
    state.form.amount=Number(chip.dataset.amount);
    $('amountInput').value=state.form.amount.toLocaleString('en-US');
    $('amountWords').textContent=numberToPersianWords(state.form.amount)+' تومان';
    updateSaveBtn();
  });
});
$('btnExpense').addEventListener('click',()=>{ state.form.type='expense'; state.form.category=null; updateTypeUI(); renderQuickCategories(); updateSaveBtn(); });
$('btnIncome').addEventListener('click',()=>{ state.form.type='income'; state.form.category=null; updateTypeUI(); renderQuickCategories(); updateSaveBtn(); });
$('noteInput').addEventListener('input',e=>{ state.form.note=e.target.value; });
$('modalOverlay').addEventListener('click',closeModal);

$('btnSave').addEventListener('click',()=>{
  if(!state.form.accountId){
    $('cardSelect').classList.add('error');
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
$('fab').addEventListener('click',openModal);

/* ===== Date Picker ===== */
function openDatePicker(target='form'){
  const d = target==='form'?state.form.date:(target==='pay'?state.payDate:(state.editForm.date||new Date()));
  const j = toJalaliParts(d);
  state.dp={year:j.y,month:j.m,day:j.d,target};
  $('dpHour').value=d.getHours(); $('dpMin').value=d.getMinutes();
  renderDp(); $('dpOverlay').classList.add('open');
}
function closeDatePicker(){ $('dpOverlay').classList.remove('open'); }
function renderDp(){
  const {year,month,day}=state.dp;
  const names=['فروردین','اردیبهشت','خرداد','تیر','مرداد','شهریور','مهر','آبان','آذر','دی','بهمن','اسفند'];
  $('dpTitle').textContent = `${names[month-1]} ${toFa(year)}`;
  const daysInMonth = jalaliMonthLength(year,month);
  const firstG = jalaliToGregorian(year,month,1);
  const startDay = (firstG.getDay()+1)%7;
  let html='';
  for(let i=0;i<startDay;i++) html+='<div></div>';
  for(let d=1;d<=daysInMonth;d++){
    const sel = d===day;
    html+=`<button class="dp-day ${sel?'selected':''}" data-day="${d}">${toFa(d)}</button>`;
  }
  $('dpDays').innerHTML=html;
  $('dpDays').querySelectorAll('button[data-day]').forEach(b=>{
    b.addEventListener('click',()=>{ state.dp.day=+b.dataset.day; renderDp(); });
  });
}
$('dateBar').addEventListener('click',()=>openDatePicker('form'));
$('dpCancel').addEventListener('click',closeDatePicker);
$('dpPrev').addEventListener('click',()=>{ state.dp.month--; if(state.dp.month<1){state.dp.month=12;state.dp.year--;} renderDp(); });
$('dpNext').addEventListener('click',()=>{ state.dp.month++; if(state.dp.month>12){state.dp.month=1;state.dp.year++;} renderDp(); });
$('dpOk').addEventListener('click',()=>{
  const g=jalaliToGregorian(state.dp.year,state.dp.month,state.dp.day);
  g.setHours(+$('dpHour').value||0,+$('dpMin').value||0,0,0);
  if(state.dp.target==='form'){ state.form.date=g; updateDateBar(); }
  else if(state.dp.target==='edit'){ state.editForm.date=g; updateEditDateBar(); }
  else if(state.dp.target==='pay'){ state.payDate=g; $('payDateValue').textContent=relativeDateLabel(g)+' — '+fmtTime(g); }
  closeDatePicker();
});
$('dpOverlay').addEventListener('click',e=>{ if(e.target===$('dpOverlay')) closeDatePicker(); });

/* ===== Dashboard ===== */
function renderDashboard(){
  $('dashTotal').textContent=fmtMoney(getTotalBalance());
  const cardsEl=$('dashCards');
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
  $('cardsBadge').textContent = toFa(state.data.accounts.length);

  const instEl=$('dashInst');
  $('instBadge').textContent = toFa(state.data.installments.length);
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
          <div style="font-size:10.5px;color:#dc2626;margin-top:2px">${disp.meta}${disp.count>1?` (×${toFa(disp.count)})`:''}</div>
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

  const alertEl=$('dashAlert');
  const pendingInsts = state.data.installments.filter(i=>{
    const d = getInstallmentDisplay(i);
    return d.status==='danger' || d.status==='warn';
  });
  const dangerInsts = pendingInsts.filter(i=>getInstallmentDisplay(i).status==='danger');
  const warnInsts = pendingInsts.filter(i=>getInstallmentDisplay(i).status==='warn');
  if(dangerInsts.length || warnInsts.length){
    let html = '<div class="card" style="background:#fef2f2;border-color:#fca5a5">';
    if(dangerInsts.length) html += `<div style="font-weight:800;color:#dc2626;font-size:13.5px;margin-bottom:6px">🔴 ${toFa(dangerInsts.length)} قسط عقب‌افتاده!</div>`;
    if(warnInsts.length) html += `<div style="font-weight:800;color:#f59e0b;font-size:13.5px;margin:6px 0 6px">🟡 ${toFa(warnInsts.length)} قسط نزدیک</div>`;
    html += '<button onclick="switchTab(\'installments\')" class="btn-soft" style="margin-top:8px;background:#dc2626;color:white;font-size:12px;padding:8px">مشاهده اقساط</button></div>';
    alertEl.innerHTML = html;
  } else { alertEl.innerHTML = ''; }

  const nowKey=jalaliMonthKey(); let exp=0;
  state.data.transactions.forEach(t=>{
    if(jalaliMonthKey(new Date(t.date))===nowKey && t.type==='expense') exp+=Number(t.amount)||0;
  });
  $('dashExpense').textContent=fmtMoney(exp);

  const recent=[...state.data.transactions].sort((a,b)=>new Date(b.date)-new Date(a.date)).slice(0,5);
  if(!recent.length){ $('dashRecent').innerHTML='<div class="empty-mini">هنوز تراکنشی نیست<br>دکمه + را بزن</div>'; }
  else {
    $('dashRecent').innerHTML=recent.map(txHtml).join('');
    $('dashRecent').querySelectorAll('.tx-item').forEach((el,i)=>{ el.addEventListener('click',()=>openEdit(recent[i].id)); });
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
  $('monthFilter').innerHTML = `<button class="filter-chip ${state.filters.month==='all'?'active':''}" data-month="all">همه</button>` +
    arr.map(m=>`<button class="filter-chip ${state.filters.month===m?'active':''}" data-month="${m}">${jalaliMonthName(m)}</button>`).join('');
  $('monthFilter').querySelectorAll('.filter-chip').forEach(b=>{
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
  $('txStatTotal').textContent=fmtMoneyShort(getTotalBalance());
  const pendingInsts = state.data.installments.filter(i=>{
    const d = getInstallmentDisplay(i);
    return d.status!=='paid';
  });
  $('txStatInst').textContent = fmtMoneyShort(pendingInsts.reduce((s,i)=>{
    const d = getInstallmentDisplay(i);
    return s + (d.totalAmount||0);
  },0));
  let list=[...state.data.transactions];
  if(state.filters.type!=='all') list=list.filter(t=>t.type===state.filters.type);
  if(state.filters.month!=='all') list=list.filter(t=>jalaliMonthKey(new Date(t.date))===state.filters.month);
  let exp=0; list.forEach(t=>{ if(t.type==='expense') exp+=t.amount; });
  $('txStatExpense').textContent=fmtMoneyShort(exp);
  list.sort((a,b)=>new Date(b.date)-new Date(a.date));
  if(!list.length){ $('txList').innerHTML='<div class="empty-mini" style="padding:60px 20px">تراکنشی نیست</div>'; return; }
  $('txList').innerHTML='<div class="card">'+list.map(txHtml).join('')+'</div>';
  $('txList').querySelectorAll('.tx-item').forEach((el,i)=>{ el.addEventListener('click',()=>openEdit(list[i].id)); });
}

/* ===== Installments ===== */
function renderInstallments(){
  const list = state.data.installments;
  const items = list.map(i=>({inst:i, disp:getInstallmentDisplay(i)}));
  const totalMonth = items.reduce((s,x)=>s+(x.disp.status!=='paid'?x.disp.totalAmount:0),0);
  $('instMonthTotal').textContent = fmtMoney(totalMonth);
  const paidTotal = items.filter(x=>x.disp.status==='paid').reduce((s,x)=>s+x.inst.amount,0);
  $('instPaidTotal').textContent = fmtMoney(paidTotal);
  const el = $('instList');
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
      meta = disp.meta + (disp.count > 1 ? ` • مجموع ${toFa(disp.count)} ماه` : '');
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
    $('instModalTitle').textContent = 'ویرایش قسط';
    $('instName').value = inst.name;
    $('instAmount').value = Number(inst.amount).toLocaleString('en-US');
    $('instWords').textContent = numberToPersianWords(inst.amount)+' تومان';
    $('instDay').value = inst.day;
  } else {
    $('instModalTitle').textContent = 'افزودن قسط';
    $('instName').value = ''; $('instAmount').value = ''; $('instWords').textContent = ''; $('instDay').value = 1;
  }
  $('instCard').innerHTML = state.data.accounts.map(a=>`<option value="${a.id}">${a.name}</option>`).join('');
  if(id){ const inst = state.data.installments.find(x=>x.id===id); $('instCard').value = inst.cardId || state.data.accounts[0]?.id; }
  $('instOverlay').classList.add('open');
  setTimeout(()=>$('instName').focus(),300);
}
$('btnAddInst').addEventListener('click',()=>{
  if(!state.data.accounts.length){ showToast('اول یک کارت اضافه کن','error'); return; }
  openInstModal(null);
});
$('instAmount').addEventListener('input',e=>{
  const f=fmtNumInput(e.target.value); e.target.value=f;
  const n=parseAmount(f);
  $('instWords').textContent = n ? numberToPersianWords(n)+' تومان' : '';
});
$('instCancel').addEventListener('click',()=>$('instOverlay').classList.remove('open'));
$('instOverlay').addEventListener('click',e=>{ if(e.target===$('instOverlay')) $('instOverlay').classList.remove('open'); });
$('instOk').addEventListener('click',()=>{
  const name = $('instName').value.trim();
  const amount = parseAmount($('instAmount').value);
  const day = Math.max(1, Math.min(31, Number($('instDay').value)||1));
  const cardId = $('instCard').value;
  if(!name || !amount){ showToast('نام و مبلغ الزامی','error'); return; }
  if(state.editingInstId){
    const inst = state.data.installments.find(x=>x.id===state.editingInstId);
    if(inst){ inst.name=name; inst.amount=amount; inst.day=day; inst.cardId=cardId; }
    saveData(); $('instOverlay').classList.remove('open');
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
    saveData(); $('instOverlay').classList.remove('open');
    renderInstallments(); renderDashboard(); showToast('✅ اضافه شد');
  }
});

function openPayModal(id){
  const inst = state.data.installments.find(x=>x.id===id); if(!inst) return;
  state.payInstId = id; state.payDate = new Date();
  const disp = getInstallmentDisplay(inst);
  $('payTitle').textContent = '💳 پرداخت ' + inst.name;
  $('paySubtitle').textContent = disp.count > 1 ? `شامل ${toFa(disp.count)} ماه پرداخت‌نشده` : `سررسید: روز ${toFa(inst.day)}`;
  $('payAmount').textContent = fmtMoney(disp.totalAmount || inst.amount);
  $('payCardSelect').innerHTML = '<option value="">— انتخاب کارت —</option>' + state.data.accounts.map(a=>{
    const bal=getAccountBalance(a.id);
    return `<option value="${a.id}">${a.name} — ${fmtMoney(bal)}</option>`;
  }).join('');
  $('payCardSelect').value = inst.cardId || '';
  $('payCardSelect').classList.remove('error');
  updatePayHint();
  $('payDateValue').textContent = relativeDateLabel(state.payDate)+' — '+fmtTime(state.payDate);
  $('payOverlay').classList.add('open'); $('paySheet').classList.add('open');
}
function closePay(){ $('payOverlay').classList.remove('open'); $('paySheet').classList.remove('open'); }
function updatePayHint(){
  if(!$('payCardSelect').value){ $('payCardHint').innerHTML = ''; return; }
  const bal = getAccountBalance($('payCardSelect').value);
  $('payCardHint').innerHTML = `موجودی: <b>${fmtMoney(bal)}</b>`;
}
$('payCardSelect').addEventListener('change',()=>{ $('payCardSelect').classList.remove('error'); updatePayHint(); });
$('payDateBar').addEventListener('click',()=>openDatePicker('pay'));
$('payOverlay').addEventListener('click',closePay);
$('payConfirm').addEventListener('click',()=>{
  const inst = state.data.installments.find(x=>x.id===state.payInstId); if(!inst) return;
  const cardId = $('payCardSelect').value;
  if(!cardId){ $('payCardSelect').classList.add('error'); showToast('لطفاً یک کارت انتخاب کن','error'); return; }
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
  disp.unpaidMonths.forEach(mo=>{
    inst.paidMonths[mo.key] = true;
    inst.paidDates[mo.key] = state.payDate.toISOString();
  });
  inst.paidCardId = cardId;
  saveData(); closePay();
  showToast('✅ قسط پرداخت شد');
  renderInstallments(); renderDashboard(); renderTransactions();
});

/* ===== Plan ===== */
function initPlanMonth(){ if(!state.planMonth.y){ const j = toJalaliParts(new Date()); state.planMonth = {y:j.y, m:j.m}; } }
function renderPlan(){
  initPlanMonth();
  const {y,m} = state.planMonth;
  $('planMonthTitle').textContent = jalaliMonthName(`${y}-${String(m).padStart(2,'0')}`);
  const plan = getPlanForMonth(y,m);
  renderPlanList('income', plan.income, y, m);
  renderPlanList('expense', plan.expense, y, m);
  const incomeTotal = plan.income.reduce((s,i)=>s+(Number(i.amount)||0),0);
  const expenseTotal = plan.expense.reduce((s,i)=>s+(Number(i.amount)||0),0);
  $('planIncomeTotal').textContent = fmtMoney(incomeTotal);
  $('planExpenseTotal').textContent = fmtMoney(expenseTotal);
  $('planBalance').textContent = fmtMoney(incomeTotal - expenseTotal);
  const monthKey = `${y}-${String(m).padStart(2,'0')}`;
  const actualIncome = state.data.transactions.filter(t=>t.type==='income' && jalaliMonthKey(new Date(t.date))===monthKey).reduce((s,t)=>s+Number(t.amount),0);
  const actualExpense = state.data.transactions.filter(t=>t.type==='expense' && jalaliMonthKey(new Date(t.date))===monthKey).reduce((s,t)=>s+Number(t.amount),0);
  $('planIncomeExpect').textContent = fmtMoney(incomeTotal);
  $('planIncomeActual').textContent = fmtMoney(actualIncome);
  $('planExpenseExpect').textContent = fmtMoney(expenseTotal);
  $('planExpenseActual').textContent = fmtMoney(actualExpense);
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
  $('planCompareResult').innerHTML = msgs.join('');
}
function renderPlanList(type, list, y, m){
  const elId = type === 'income' ? 'planIncomeList' : 'planExpenseList';
  const el = $(elId);
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
$('planPrev').addEventListener('click',()=>{ state.planMonth.m--; if(state.planMonth.m<1){ state.planMonth.m=12; state.planMonth.y--; } renderPlan(); });
$('planNext').addEventListener('click',()=>{ state.planMonth.m++; if(state.planMonth.m>12){ state.planMonth.m=1; state.planMonth.y++; } renderPlan(); });
function openPlanModal(id=null, type='expense'){
  state.editingPlanId = id; state.editingPlanType = type;
  const plan = getPlanForMonth(state.planMonth.y, state.planMonth.m);
  if(id){
    const item = plan[type].find(x=>x.id===id); if(!item) return;
    $('planModalTitle').textContent = type === 'income' ? '✏️ ویرایش درآمد' : '✏️ ویرایش هزینه';
    $('planText').value = item.text;
    $('planAmount').value = item.amount ? Number(item.amount).toLocaleString('en-US') : '';
    if(!$('planDeleteBtn')){
      const btn = document.createElement('button');
      btn.id = 'planDeleteBtn'; btn.className = 'btn-soft btn-danger'; btn.style.marginTop = '8px'; btn.textContent = '🗑️ حذف';
      btn.onclick = ()=>{
        const plan = getPlanForMonth(state.planMonth.y, state.planMonth.m);
        plan[type] = plan[type].filter(x=>x.id!==id);
        savePlanForMonth(state.planMonth.y, state.planMonth.m, plan);
        saveData(); $('planOverlay').classList.remove('open'); renderPlan(); showToast('حذف شد');
      };
      $('planOverlay').querySelector('.dp-box').appendChild(btn);
    }
  } else {
    $('planModalTitle').textContent = type === 'income' ? '➕ افزودن درآمد' : '➕ افزودن هزینه';
    $('planText').value = ''; $('planAmount').value = '';
    const del = $('planDeleteBtn'); if(del) del.remove();
  }
  $('planOverlay').classList.add('open');
  setTimeout(()=>$('planText').focus(),300);
}
$('btnAddPlanIncome').addEventListener('click',()=>openPlanModal(null, 'income'));
$('btnAddPlanExpense').addEventListener('click',()=>openPlanModal(null, 'expense'));
$('planCancel').addEventListener('click',()=>$('planOverlay').classList.remove('open'));
$('planOverlay').addEventListener('click',e=>{ if(e.target===$('planOverlay')) $('planOverlay').classList.remove('open'); });
$('planAmount').addEventListener('input',e=>{ const f=fmtNumInput(e.target.value); e.target.value=f; });
$('planOk').addEventListener('click',()=>{
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
  $('planOverlay').classList.remove('open'); renderPlan(); showToast('✅ ذخیره شد');
});

/* ===== Edit ===== */
function openEdit(id){
  const t=state.data.transactions.find(x=>x.id===id); if(!t) return;
  state.editingTxId=id;
  state.editForm={type:t.type,amount:t.amount,category:t.category,note:t.note||'',date:new Date(t.date),accountId:t.accountId||''};
  $('editAmount').value=Number(t.amount).toLocaleString('en-US');
  $('editAmountWords').textContent=numberToPersianWords(t.amount)+' تومان';
  $('editNote').value=t.note||'';
  updateEditTypeUI(); renderEditCats(); updateEditDateBar(); renderEditCardSelect();
  $('editOverlay').classList.add('open'); $('editSheet').classList.add('open');
}
function closeEdit(){ $('editOverlay').classList.remove('open'); $('editSheet').classList.remove('open'); state.editingTxId=null; }
function updateEditTypeUI(){
  const isExp=state.editForm.type==='expense';
  $('editBtnExpense').classList.toggle('active',isExp);
  $('editBtnIncome').classList.toggle('active',!isExp);
  $('editAmountWrap').classList.toggle('income',!isExp);
}
function updateEditDateBar(){ $('editDateValue').textContent=relativeDateLabel(state.editForm.date)+' — '+fmtTime(state.editForm.date); }
function renderEditCardSelect(){
  $('editCardSelect').innerHTML='<option value="">— انتخاب —</option>'+state.data.accounts.map(a=>`<option value="${a.id}">${a.name}</option>`).join('');
  $('editCardSelect').value=state.editForm.accountId || '';
}
function renderEditCats(){
  const list=state.data.categories[state.editForm.type]||[];
  $('editCatList').innerHTML=list.map(c=>`
    <button class="cat-row ${state.editForm.category===c.id?'selected':''}" data-cat="${c.id}" style="--cat-color:${c.color}">
      <span class="em">${c.emoji}</span><span class="nm">${c.name}</span>
    </button>`).join('');
  $('editCatList').querySelectorAll('.cat-row').forEach(b=>{
    b.addEventListener('click',()=>{ state.editForm.category=b.dataset.cat; renderEditCats(); });
  });
  $('editCatSelectMobile').innerHTML = '<option value="">— انتخاب —</option>' + list.map(c=>`
    <option value="${c.id}" ${state.editForm.category===c.id?'selected':''}>${c.emoji} ${c.name}</option>`).join('');
}
$('editCatSelectMobile').addEventListener('change',e=>{ state.editForm.category=e.target.value||null; });
$('editAmount').addEventListener('input',e=>{
  const f=fmtNumInput(e.target.value); e.target.value=f;
  state.editForm.amount=parseAmount(f);
  $('editAmountWords').textContent = state.editForm.amount ? numberToPersianWords(state.editForm.amount)+' تومان' : '';
});
$('editNote').addEventListener('input',e=>{ state.editForm.note=e.target.value; });
$('editCardSelect').addEventListener('change',e=>{ state.editForm.accountId=e.target.value; });
$('editBtnExpense').addEventListener('click',()=>{ state.editForm.type='expense'; state.editForm.category=null; updateEditTypeUI(); renderEditCats(); });
$('editBtnIncome').addEventListener('click',()=>{ state.editForm.type='income'; state.editForm.category=null; updateEditTypeUI(); renderEditCats(); });
$('editDateBar').addEventListener('click',()=>openDatePicker('edit'));
$('editCancel').addEventListener('click',closeEdit);
$('editOverlay').addEventListener('click',closeEdit);
$('editSave').addEventListener('click',()=>{
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
$('editDelete').addEventListener('click',()=>{
  if(!confirm('حذف شود؟')) return;
  state.data.transactions=state.data.transactions.filter(x=>x.id!==state.editingTxId);
  saveData(); closeEdit(); showToast('🗑️ حذف شد');
  renderTransactions(); renderDashboard();
});

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
    $('reportAnalysis').innerHTML=`<div class="analysis-card"><h4>📊 تحلیل هوشمند</h4>${lines.map(l=>`<p>${l}</p>`).join('')}</div>`;
    $('reportSummary').innerHTML = `
      <div class="report-row"><span class="lbl">💳 موجودی کل</span><span class="val" style="color:#6366f1">${fmtMoney(getTotalBalance())}</span></div>
      <div class="report-row"><span class="lbl">📉 هزینه‌ها</span><span class="val" style="color:#ef4444">${fmtMoney(exp)}</span></div>
      ${inc>0?`<div class="report-row"><span class="lbl">➕ افزایش موجودی</span><span class="val" style="color:#10b981">${fmtMoney(inc)}</span></div>`:''}
      <div class="report-row"><span class="lbl">🔢 تعداد تراکنش‌ها</span><span class="val">${toFa(list.length)}</span></div>`;
    const catsEl=$('reportCats');
    if(!sortedCats.length){ catsEl.innerHTML='<div class="empty-mini">هزینه‌ای در این بازه نیست</div>'; }
    else {
      const max = sortedCats[0][1];
      catsEl.innerHTML = sortedCats.map(([id,v])=>{
        const cat=findCategory('expense',id);
        const pct = max?Math.round(v/max*100):0;
        return `<div class="bar-row"><div class="bar-label"><span class="name">${cat?cat.emoji+' '+cat.name:id}</span><span class="amt num">${fmtMoney(v)}</span></div><div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${cat?cat.color:'#94a3b8'}"></div></div></div>`;
      }).join('');
    }
    const top5=[...list].filter(t=>t.type==='expense').sort((a,b)=>b.amount-a.amount).slice(0,5);
    if(!top5.length){ $('reportTopExpenses').innerHTML='<div class="empty-mini">داده‌ای نیست</div>'; }
    else {
      $('reportTopExpenses').innerHTML=top5.map(txHtml).join('');
      $('reportTopExpenses').querySelectorAll('.tx-item').forEach((el,i)=>{ el.addEventListener('click',()=>openEdit(top5[i].id)); });
    }
  }catch(e){ console.error('خطا در گزارش:', e); }
}

/* ===== Settings ===== */
function renderSettings(){
  renderCardsManage(); renderCatManage();
  $('setCardsBadge').textContent = toFa(state.data.accounts.length);
  $('setCatsBadge').textContent = toFa((state.data.categories.expense.length + state.data.categories.income.length));
  $('reminderDays').value = state.data.settings.reminderDays||3;
  if(state.currentUser){ $('userEmail').textContent = state.currentUser.email || ''; }
}
function renderCardsManage(){
  const el=$('cardsManageList');
  if(!state.data.accounts.length){ el.innerHTML='<div class="empty-mini">هنوز کارتی نداری</div>'; return; }
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
      saveData(); renderCardsManage(); renderDashboard(); renderSettings(); showToast('حذف شد');
    });
  });
  el.querySelectorAll('.edit-acc').forEach(b=>{
    b.addEventListener('click',()=>{
      const acc=findAccount(b.dataset.id); if(!acc) return;
      state.editingCardId=acc.id; $('cardModalTitle').textContent='ویرایش کارت';
      $('newCardName').value=acc.name; $('newCardBalance').value=Number(acc.initialBalance).toLocaleString('en-US');
      $('newCardWords').textContent=numberToPersianWords(acc.initialBalance)+' تومان';
      $('cardOverlay').classList.add('open');
    });
  });
}
$('btnAddCard').addEventListener('click',()=>{
  state.editingCardId=null; $('cardModalTitle').textContent='افزودن کارت';
  $('newCardName').value=''; $('newCardBalance').value=''; $('newCardWords').textContent='';
  $('cardOverlay').classList.add('open'); setTimeout(()=>$('newCardName').focus(),300);
});
document.querySelectorAll('#catTypeToggle .filter-chip').forEach(b=>{
  b.addEventListener('click',()=>{
    state.catManageType=b.dataset.ctype;
    document.querySelectorAll('#catTypeToggle .filter-chip').forEach(x=>x.classList.remove('active'));
    b.classList.add('active'); renderCatManage();
  });
});
function renderCatManage(){
  const list=state.data.categories[state.catManageType]||[];
  const el=$('catManageList');
  el.innerHTML=list.map(c=>`
    <div class="cat-manage-item">
      <div class="info">
        <div class="emoji-box" style="background:${c.color}25;color:${c.color}">${c.emoji}</div>
        <span style="font-size:14px;font-weight:600;color:#334155">${c.name}</span>
      </div>
      <button class="icon-mini icon-del del" data-id="${c.id}">✕</button>
    </div>`).join('');
  el.querySelectorAll('.del').forEach(b=>{
    b.addEventListener('click',()=>{
      if(!confirm('حذف شود؟')) return;
      state.data.categories[state.catManageType]=state.data.categories[state.catManageType].filter(c=>c.id!==b.dataset.id);
      saveData(); renderCatManage(); renderSettings(); showToast('حذف شد');
    });
  });
}
$('btnAddCat').addEventListener('click',()=>{ $('newCatName').value=''; $('newCatEmoji').value=''; $('catOverlay').classList.add('open'); });
$('catCancel').addEventListener('click',()=>$('catOverlay').classList.remove('open'));
$('catOverlay').addEventListener('click',e=>{ if(e.target===$('catOverlay')) $('catOverlay').classList.remove('open'); });
$('catOk').addEventListener('click',()=>{
  const name=$('newCatName').value.trim(); const emoji=$('newCatEmoji').value.trim()||'📦';
  if(!name){ showToast('نام را وارد کن','error'); return; }
  const colors=['#f97316','#10b981','#3b82f6','#8b5cf6','#ec4899','#06b6d4','#eab308','#14b8a6'];
  state.data.categories[state.catManageType].push({id:'c_'+uid(),name,emoji,color:colors[Math.floor(Math.random()*colors.length)]});
  saveData(); renderCatManage(); renderSettings(); $('catOverlay').classList.remove('open'); showToast('✅ اضافه شد');
});
$('reminderDays').addEventListener('change',e=>{ state.data.settings.reminderDays = Number(e.target.value); saveData(); showToast('✅ ذخیره شد'); });
$('bellToggle').addEventListener('click',()=>{
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
$('btnEnableNotif').addEventListener('click',()=>$('bellToggle').click());
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
$('btnBackup').addEventListener('click',()=>{
  const blob=new Blob([JSON.stringify(state.data,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob); const a=document.createElement('a');
  a.href=url; a.download=`jib-man-${jalaliShort().replace(/\//g,'-')}.json`; a.click(); URL.revokeObjectURL(url);
  showToast('📥 دانلود شد');
});
$('btnRestore').addEventListener('click',()=>$('restoreFile').click());
$('restoreFile').addEventListener('change',e=>{
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
$('btnCsv').addEventListener('click',()=>{
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
$('btnWipe').addEventListener('click',()=>{
  if(!confirm('همه داده‌ها حذف شوند؟')) return;
  state.data=JSON.parse(JSON.stringify(defaultData)); saveData(); location.reload();
});

/* ===== Cloud Sync Buttons ===== */
$('btnSyncNow').addEventListener('click', async ()=>{
  if(!state.currentUser){ showToast('اول وارد شو','error'); return; }
  if(!navigator.onLine){ showToast('اینترنت وصل نیست','error'); return; }
  showToast('در حال سینک...');
  try{
    await uploadToCloud(state.data);
    showToast('✅ سینک انجام شد');
  }catch(e){ showToast('خطا در سینک','error'); }
});
$('btnPullCloud').addEventListener('click', async ()=>{
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
$('btnLogout').addEventListener('click', async ()=>{
  if(!confirm('از حساب خارج می‌شوی؟\n\n⚠️ داده‌های محلی پاک می‌شن (ولی توی سرور می‌مونن)')) return;
  if(typeof clearAllUserData === 'function') clearAllUserData();
  else {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem('jib_last_user_id');
  }
  state.data = JSON.parse(JSON.stringify(defaultData));
  await signOut();
  state.currentUser = null;
  showAuthScreen();
  setAuthMode('login');
  $('authEmail').value = '';
  $('authPassword').value = '';
  showToast('✅ خارج شدی');
});

/* ===== Init ===== */
async function init(){
  applyTheme();
  setTimeout(()=>{
    $('splash').classList.add('hide');
    setTimeout(()=>{ const s = $('splash'); if(s) s.remove(); }, 600);
  }, 2000);
  try {
    await initSupabase();
    const logged = await checkAuth();
    if(logged){
      // 🔐 چک کن کاربر عوض شده
      const lastUserId = localStorage.getItem('jib_last_user_id');
      if(lastUserId && lastUserId !== currentUser.id){
        console.log('🔄 کاربر عوض شد!');
        localStorage.removeItem(STORAGE_KEY);
        state.data = JSON.parse(JSON.stringify(defaultData));
      }
      localStorage.setItem('jib_last_user_id', currentUser.id);
      
      hideAuthScreen();
      setTimeout(onUserLoggedIn, 100);
    } else {
      showAuthScreen();
      setAuthMode('login');
    }
  } catch(e){
    console.error('خطا در اتصال اولیه:', e);
    showAuthScreen();
    setAuthMode('login');
    showAuthError('اتصال به سرور برقرار نیست. اینترنت را چک کن.');
  }
  setInterval(checkNotifications, 30000);
  setTimeout(checkNotifications, 3000);
  console.log('✅ جیب من آماده شد');
}
init();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(()=>{}); });
}
