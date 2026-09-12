/* ===== جیب من - app.js ===== */
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
  planMonth:{y:0,m:0}
};

function loadData(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw){
      const old = localStorage.getItem('jib_man_v8')||localStorage.getItem('jib_man_v7')||localStorage.getItem('jib_man_v6')||localStorage.getItem('jib_man_v5');
      if(old){
        const p = JSON.parse(old);
        return Object.assign({},defaultData,p,
          {settings:Object.assign({},defaultData.settings,p.settings||{})},
          {categories:Object.assign({},defaultData.categories,p.categories||{})},
          {accounts:p.accounts||[]},{
