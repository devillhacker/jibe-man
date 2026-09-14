/* ============================================
   جیب من — Supabase Connection
   ============================================ */

const SUPABASE_URL = 'https://lwqaltkojnnxilurzngr.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx3cWFsdGtvam5ueGlsdXJ6bmdyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkzNjk0NTgsImV4cCI6MjEwNDk0NTQ1OH0.RxOM4PYCX7dmGd_DM-V-oborlCUJY94tT2MVt-BhnB4';

let sbClient = null;
let currentUser = null;
let syncStatus = 'offline'; // 'online' | 'syncing' | 'offline' | 'pending'

/* ===== بارگذاری کتابخانه Supabase ===== */
async function initSupabase() {
  try {
    // بارگذاری کتابخانه از CDN
    if (!window.supabase) {
      await loadScript('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2');
    }
    
    sbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storage: window.localStorage
      }
    });
    
    // چک کردن session فعلی
    const { data: { session } } = await sbClient.auth.getSession();
    if (session) {
      currentUser = session.user;
      updateSyncStatus('online');
      return true;
    }
    
    updateSyncStatus('offline');
    return false;
  } catch (e) {
    console.error('خطا در اتصال به Supabase:', e);
    updateSyncStatus('offline');
    return false;
  }
}

/* ===== بارگذاری اسکریپت ===== */
function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

/* ===== ثبت‌نام ===== */
async function signUp(email, password) {
  if (!sbClient) throw new Error('اتصال به سرور برقرار نیست');
  const { data, error } = await sbClient.auth.signUp({ email, password });
  if (error) throw error;
  return data;
}

/* ===== ورود ===== */
async function signIn(email, password) {
  if (!sbClient) throw new Error('اتصال به سرور برقرار نیست');
  const { data, error } = await sbClient.auth.signInWithPassword({ email, password });
  if (error) throw error;
  currentUser = data.user;
  updateSyncStatus('online');
  return data;
}

/* ===== خروج ===== */
async function signOut() {
  if (!sbClient) return;
  await sbClient.auth.signOut();
  currentUser = null;
  updateSyncStatus('offline');
}

/* ===== چک کردن لاگین ===== */
async function checkAuth() {
  if (!sbClient) return false;
  const { data: { session } } = await sbClient.auth.getSession();
  if (session) {
    currentUser = session.user;
    return true;
  }
  return false;
}

/* ===== آپلود به Supabase ===== */
async function uploadToCloud(data) {
  if (!currentUser) throw new Error('کاربر لاگین نکرده');
  updateSyncStatus('syncing');
  
  try {
    const userId = currentUser.id;
    
    // ۱. پاک کردن داده‌های قدیمی
    await sbClient.from('transactions').delete().eq('user_id', userId);
    await sbClient.from('accounts').delete().eq('user_id', userId);
    await sbClient.from('installments').delete().eq('user_id', userId);
    await sbClient.from('plans').delete().eq('user_id', userId);
    
    // ۲. آپلود کارت‌ها
    if (data.accounts && data.accounts.length) {
      const accounts = data.accounts.map(a => ({
        user_id: userId,
        local_id: a.id,
        name: a.name,
        color: a.color,
        initial_balance: a.initialBalance || 0
      }));
      const { error: err1 } = await sbClient.from('accounts').insert(accounts);
      if (err1) throw err1;
    }
    
    // ۳. آپلود تراکنش‌ها
    if (data.transactions && data.transactions.length) {
      const txs = data.transactions.map(t => ({
        user_id: userId,
        local_id: t.id,
        type: t.type,
        amount: t.amount,
        category: t.category,
        account_id: t.accountId,
        note: t.note || '',
        date: t.date
      }));
      const { error: err2 } = await sbClient.from('transactions').insert(txs);
      if (err2) throw err2;
    }
    
    // ۴. آپلود اقساط
    if (data.installments && data.installments.length) {
      const insts = data.installments.map(i => ({
        user_id: userId,
        local_id: i.id,
        name: i.name,
        amount: i.amount,
        day: i.day,
        card_id: i.cardId,
        paid_months: i.paidMonths || {},
        paid_dates: i.paidDates || {},
        created_month: i.createdMonth
      }));
      const { error: err3 } = await sbClient.from('installments').insert(insts);
      if (err3) throw err3;
    }
    
    // ۵. آپلود برنامه‌ریزی
    if (data.plans && Object.keys(data.plans).length) {
      const plans = Object.entries(data.plans).map(([monthKey, planData]) => ({
        user_id: userId,
        month_key: monthKey,
        data: planData
      }));
      const { error: err4 } = await sbClient.from('plans').insert(plans);
      if (err4) throw err4;
    }
    
    // ۶. آپلود تنظیمات
    await sbClient.from('user_settings').upsert({
      user_id: userId,
      categories: data.categories || {},
      theme: data.settings?.theme || 'light',
      reminder_days: data.settings?.reminderDays || 3,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id' });
    
    updateSyncStatus('online');
    return true;
  } catch (e) {
    console.error('خطا در آپلود:', e);
    updateSyncStatus('pending');
    throw e;
  }
}

/* ===== دانلود از Supabase ===== */
async function downloadFromCloud() {
  if (!currentUser) throw new Error('کاربر لاگین نکرده');
  updateSyncStatus('syncing');
  
  try {
    const userId = currentUser.id;
    const result = {
      accounts: [],
      transactions: [],
      installments: [],
      plans: {},
      categories: null,
      settings: null
    };
    
    // ۱. کارت‌ها
    const { data: accounts } = await sbClient.from('accounts').select('*').eq('user_id', userId);
    if (accounts) {
      result.accounts = accounts.map(a => ({
        id: a.local_id || a.id.toString(),
        name: a.name,
        color: a.color,
        initialBalance: Number(a.initial_balance) || 0
      }));
    }
    
    // ۲. تراکنش‌ها
    const { data: txs } = await sbClient.from('transactions').select('*').eq('user_id', userId);
    if (txs) {
      result.transactions = txs.map(t => ({
        id: t.local_id || t.id.toString(),
        type: t.type,
        amount: Number(t.amount),
        category: t.category,
        accountId: t.account_id,
        note: t.note,
        date: t.date
      }));
    }
    
    // ۳. اقساط
    const { data: insts } = await sbClient.from('installments').select('*').eq('user_id', userId);
    if (insts) {
      result.installments = insts.map(i => ({
        id: i.local_id || i.id.toString(),
        name: i.name,
        amount: Number(i.amount),
        day: i.day,
        cardId: i.card_id,
        paidMonths: i.paid_months || {},
        paidDates: i.paid_dates || {},
        createdMonth: i.created_month
      }));
    }
    
    // ۴. برنامه‌ریزی
    const { data: plans } = await sbClient.from('plans').select('*').eq('user_id', userId);
    if (plans) {
      plans.forEach(p => {
        result.plans[p.month_key] = p.data;
      });
    }
    
    // ۵. تنظیمات
    const { data: settings } = await sbClient.from('user_settings').select('*').eq('user_id', userId).maybeSingle();
    if (settings) {
      result.categories = settings.categories;
      result.settings = {
        theme: settings.theme,
        reminderDays: settings.reminder_days
      };
    }
    
    updateSyncStatus('online');
    return result;
  } catch (e) {
    console.error('خطا در دانلود:', e);
    updateSyncStatus('offline');
    throw e;
  }
}

/* ===== آپدیت وضعیت سینک ===== */
function updateSyncStatus(status) {
  syncStatus = status;
  const el = document.getElementById('syncStatus');
  if (!el) return;
  
  const icons = {
    online: '🟢',
    syncing: '🟡',
    offline: '🔴',
    pending: '🟠'
  };
  const labels = {
    online: 'سینک شده',
    syncing: 'در حال سینک...',
    offline: 'آفلاین',
    pending: 'در انتظار سینک'
  };
  
  el.textContent = icons[status] + ' ' + labels[status];
  el.title = labels[status];
}

/* ===== رصد آنلاین/آفلاین ===== */
window.addEventListener('online', () => {
  updateSyncStatus('online');
  if (typeof autoSync === 'function') autoSync();
});
window.addEventListener('offline', () => {
  updateSyncStatus('offline');
});
