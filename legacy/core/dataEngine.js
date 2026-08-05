import { DEFAULT_TEST_DATA_LIBRARY, FIELD_KINDS } from './types.js';

const CN_LAST_NAMES = ['王', '李', '张', '刘', '陈', '杨', '赵', '黄', '周', '吴', '徐', '孙', '胡', '郭', '何'];
const CN_FIRST_NAMES = ['晨', '璟', '娜', '乐', '伟', '佳', '磊', '婷', '昊', '瑞', '琳', '博', '芳', '媛', '帆'];
const EN_FIRST_NAMES = ['Olivia', 'Emma', 'Sophia', 'Noah', 'Liam', 'Ethan', 'Ava', 'Mia', 'Lucas', 'Evelyn'];
const EN_LAST_NAMES = ['Anderson', 'Hall', 'Lewis', 'Taylor', 'Walker', 'Young', 'Allen', 'Scott', 'King', 'Baker'];
const CN_COMPANY_PREFIXES = ['灵犀', '启航', '智联', '远见', '华创', '云启', '星河', '永业', '天启', '智诚'];
const CN_COMPANY_SUFFIXES = ['科技有限公司', '信息技术有限公司', '数据服务有限公司', '企业管理有限公司', '数字科技有限公司'];
const EN_COMPANY_PREFIXES = ['Aurora', 'Nova', 'Vertex', 'Atlas', 'BluePeak', 'CloudRiver', 'EverBridge', 'BrightCore'];
const EN_COMPANY_SUFFIXES = ['Technologies', 'Holdings', 'Solutions', 'Systems', 'Digital', 'Labs'];
const GOV_DEPARTMENTS = ['市场监督管理局', '工业和信息化局', '人力资源和社会保障局', '商务局', '民政局'];
const CN_JOB_TITLES = ['产品经理', '销售主管', '测试经理', '解决方案架构师', '交互设计师', '机器学习工程师'];
const EN_JOB_TITLES = ['Product Manager', 'Sales Manager', 'QA Manager', 'Solutions Architect', 'Interaction Designer', 'Machine Learning Engineer'];
const STREETS = ['中山路', '解放大道', '青年路', '人民路', '软件园路', '福田大道', '滨江路', '建国路', '新华路'];
const HK_DISTRICTS = ['中西區', '灣仔區', '東區', '南區', '油尖旺區', '深水埗區', '九龍城區', '觀塘區', '荃灣區', '沙田區', '屯門區', '元朗區'];
const HK_STREETS = ['軒尼詩道', '彌敦道', '干諾道中', '皇后大道中', '德輔道中', '亞皆老街', '青山公路', '觀塘道'];
const SHORT_SENTENCES_ZH = [
  '我们正在优化流程并计划拓展华南市场。',
  '即将启动新一轮版本发布与回归验证。',
  '产研联动加速，客户体验持续提升。',
  '新一代 AI 能力已纳入研发计划，预计下季度灰度。'
];
const SHORT_SENTENCES_EN = [
  'We are expanding into the APAC market and refining our operations.',
  'The next release train is scheduled with full regression coverage.',
  'Customer experience continues to improve through cross-team delivery.',
  'A new AI capability is planned for the next staged rollout.'
];
const ORG_MISSION_TEXTS = [
  '致力于为社区长者、青年与基层家庭提供可持续、可负担且可复制的社会服务支持。',
  '以推动社区共融、提升公共参与及强化基层服务可及性为宗旨，持续建设长期社会价值。',
  '通过专业培训、数字化协作与社区网络联动，促进弱势群体获得更稳定的发展机会。',
  '围绕公益服务、资源连接与志愿网络建设，持续推动社区福祉与社会创新。'
];
const SERVICE_CONTENT_TEXTS = [
  '主要提供社区支援、志愿者培训、活动组织、个案转介及线上咨询等综合服务。',
  '服务内容涵盖社区教育、长者探访、青年成长辅导、公益活动统筹及资源对接。',
  '目前提供机构咨询、项目执行、公益培训、社区联动及数码化服务支援。',
  '主要开展社区服务计划、机构能力建设、专项主题活动及公共信息推广。'
];
const COMPANY_INTRO_TEXTS = [
  '本机构长期聚焦社区服务数字化建设，具备项目执行、运营管理与跨部门协同经验。',
  '团队在社会服务、流程管理与信息化建设方面拥有成熟实践，可支持多类型注册与合规场景。',
  '机构核心能力覆盖服务设计、数据治理、培训运营与落地执行，已形成稳定的服务交付体系。',
  '我们持续为政企与公益组织提供流程优化、系统实施与运营支持，强调长期价值与服务质量。'
];
const PROJECT_PLAN_TEXTS = [
  '项目将分为筹备、试点、复盘与扩展四个阶段推进，先完成基础流程搭建，再逐步扩大服务覆盖范围。',
  '计划在首阶段完成团队组建与机制建立，随后通过试运行验证服务流程并根据反馈持续优化。',
  '本阶段重点是完善实施方案、明确责任分工、建立数据追踪机制，并在三个月内完成首轮交付。',
  '执行计划以季度为单位滚动推进，优先落地核心服务模块，再逐步补齐培训、复盘与评估体系。'
];
const DEPARTMENT_NAMES = ['综合管理部', '公共事务部', '项目运营部', '客户成功部', '技术支持部', '社会服务部'];
const SCHOOL_NAMES = ['香港城市大学', '香港浸会大学', '北京大学', '复旦大学', '中山大学', '华南理工大学'];
const PROVINCES = [
  { province: '上海市', cities: ['上海市'], districts: ['徐汇区', '浦东新区', '静安区', '闵行区'] },
  { province: '广东省', cities: ['广州市', '深圳市'], districts: ['天河区', '南山区', '福田区', '海珠区'] },
  { province: '江苏省', cities: ['南京市', '苏州市'], districts: ['玄武区', '姑苏区', '工业园区'] },
  { province: '四川省', cities: ['成都市'], districts: ['高新区', '武侯区', '锦江区'] },
  { province: '陕西省', cities: ['西安市'], districts: ['雁塔区', '未央区', '碑林区'] }
];

const LEGACY_DEFAULT_RICH_TEXT_POOL = [
  '<p>这是一段用于富文本编辑器的测试内容。</p>',
  '<p><strong>测试标题</strong><br>这里可以填写多行说明。</p>'
];

function rand(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickRandomItem(items = []) {
  if (!Array.isArray(items) || !items.length) return null;
  return items[Math.floor(Math.random() * items.length)] || null;
}

function normalizePoolList(value = [], fallback = []) {
  const source = Array.isArray(value) ? value : fallback;
  return (Array.isArray(source) ? source : [])
    .map((item) => String(item || '').trim())
    .filter(Boolean);
}

function isSameStringList(a = [], b = []) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  return a.every((item, index) => String(item || '').trim() === String(b[index] || '').trim());
}

function normalizeRichTextPoolList(value = [], fallback = []) {
  const normalized = normalizePoolList(value, fallback);
  return isSameStringList(normalized, LEGACY_DEFAULT_RICH_TEXT_POOL) ? normalizePoolList(fallback, fallback) : normalized;
}

function createEmptyFilePools() {
  return {
    document: [],
    image: [],
    video: [],
    audio: [],
    archive: []
  };
}

export function getTestDataLibrary(settings = {}) {
  const raw = settings.testDataLibrary && typeof settings.testDataLibrary === 'object'
    ? settings.testDataLibrary
    : {};
  const rawPools = raw.pools && typeof raw.pools === 'object' ? raw.pools : {};
  const defaultPools = DEFAULT_TEST_DATA_LIBRARY.pools || {};
  const legacyEmail = Array.isArray(settings.emailPoolList) && settings.emailPoolList.length
    ? settings.emailPoolList
    : defaultPools.email;

  return {
    version: Number(raw.version || DEFAULT_TEST_DATA_LIBRARY.version || 1),
    enabled: raw.enabled !== false,
    pools: {
      chineseName: normalizePoolList(rawPools.chineseName, defaultPools.chineseName),
      englishName: normalizePoolList(rawPools.englishName, defaultPools.englishName),
      mobile: {
        cn: normalizePoolList(rawPools.mobile?.cn, defaultPools.mobile?.cn),
        hk: normalizePoolList(rawPools.mobile?.hk, defaultPools.mobile?.hk),
        mo: normalizePoolList(rawPools.mobile?.mo, defaultPools.mobile?.mo)
      },
      companyName: normalizePoolList(rawPools.companyName, defaultPools.companyName),
      socialCreditCode: normalizePoolList(rawPools.socialCreditCode, defaultPools.socialCreditCode),
      email: normalizePoolList(rawPools.email, legacyEmail),
      idDocument: {
        cnId: normalizePoolList(rawPools.idDocument?.cnId, defaultPools.idDocument?.cnId),
        hmtResident: normalizePoolList(rawPools.idDocument?.hmtResident, defaultPools.idDocument?.hmtResident),
        passport: normalizePoolList(rawPools.idDocument?.passport, defaultPools.idDocument?.passport)
      },
      landline: normalizePoolList(rawPools.landline, defaultPools.landline),
      address: normalizePoolList(rawPools.address, defaultPools.address),
      date: normalizePoolList(rawPools.date, defaultPools.date),
      plainText: normalizePoolList(rawPools.plainText, defaultPools.plainText),
      richText: normalizeRichTextPoolList(rawPools.richText, defaultPools.richText),
      number: normalizePoolList(rawPools.number, defaultPools.number),
      file: {
        ...createEmptyFilePools(),
        ...(rawPools.file && typeof rawPools.file === 'object' ? rawPools.file : {})
      }
    }
  };
}

export function getTestDataPool(settings = {}, path = '') {
  const library = getTestDataLibrary(settings);
  if (library.enabled === false) return [];
  const keys = Array.isArray(path) ? path : String(path || '').split('.').filter(Boolean);
  let current = library.pools;
  for (const key of keys) {
    current = current?.[key];
    if (current == null) return [];
  }
  return Array.isArray(current) ? current : [];
}

export function pickTestDataValue(settings = {}, path = '') {
  const pool = getTestDataPool(settings, path);
  return pickRandomItem(pool);
}

function pickConfiguredValue(settings = {}, path = '') {
  const value = pickTestDataValue(settings, path);
  return value == null || value === '' ? null : value;
}

function splitConfiguredName(name = '', part = 'first', lang = 'zh') {
  const text = String(name || '').trim();
  if (!text) return '';
  if (lang === 'en') {
    const pieces = text.split(/\s+/).filter(Boolean);
    if (part === 'last') return pieces.length > 1 ? pieces[pieces.length - 1] : text;
    return pieces[0] || text;
  }
  if (part === 'last') return text.slice(0, 1);
  return text.slice(1) || text;
}

function buildChineseName() {
  return `${rand(CN_LAST_NAMES)}${rand(CN_FIRST_NAMES)}`;
}

function buildEnglishName() {
  return `${rand(EN_FIRST_NAMES)} ${rand(EN_LAST_NAMES)}`;
}

function buildFirstNameByLang(lang = 'zh') {
  return lang === 'en' ? rand(EN_FIRST_NAMES) : rand(CN_FIRST_NAMES);
}

function buildLastNameByLang(lang = 'zh') {
  return lang === 'en' ? rand(EN_LAST_NAMES) : rand(CN_LAST_NAMES);
}

function buildCompanyName(lang = 'zh') {
  if (lang === 'gov') {
    return rand(GOV_DEPARTMENTS);
  }
  if (lang === 'en') {
    return `${rand(EN_COMPANY_PREFIXES)} ${rand(EN_COMPANY_SUFFIXES)}`;
  }
  return `${rand(CN_COMPANY_PREFIXES)}${rand(CN_COMPANY_SUFFIXES)}`;
}

function buildEmail(emailPool = []) {
  if (emailPool.length) return rand(emailPool);
  return `qa_${Date.now().toString().slice(-6)}@example.com`;
}

function buildPhone() {
  return `1${randomInt(3, 9)}${String(randomInt(0, 999999999)).padStart(9, '0')}`;
}

function buildHongKongPhone() {
  return `${randomInt(5, 9)}${String(randomInt(0, 9999999)).padStart(7, '0')}`;
}

function buildMacauPhone() {
  return `6${String(randomInt(0, 9999999)).padStart(7, '0')}`;
}

function detectRegionByHint(hint = '') {
  if (/(^|[^\d])\+852([^\d]|$)|香港|hong kong|\bhk\b|港島|港岛|九龍|九龙|新界|街號|大廈|室[／/]樓[／/]大廈|區域[／/]地區|区域[／/]地区/i.test(String(hint || ''))) {
    return 'hk';
  }
  if (/(^|[^\d])\+853([^\d]|$)|澳门|澳門|macau|macao|\bmo\b/i.test(String(hint || ''))) {
    return 'mo';
  }
  if (/(^|[^\d])\+86([^\d]|$)|大陆|內地|内地|china|中国/i.test(String(hint || ''))) {
    return 'cn';
  }
  return 'cn';
}

function detectPhoneRegionByHint(hint = '', fallback = 'cn') {
  const text = String(hint || '');
  if (/(^|[^\d])\+852([^\d]|$)/i.test(text)) return 'hk';
  if (/(^|[^\d])\+853([^\d]|$)/i.test(text)) return 'mo';
  if (/(^|[^\d])\+86([^\d]|$)/i.test(text)) return 'cn';
  const region = detectRegionByHint(text);
  return region || fallback;
}

function buildLandline() {
  const area = randomInt(10, 99);
  const number = String(randomInt(1000000, 99999999));
  return `0${area}-${number}`;
}

function buildIdcard() {
  const area = `${randomInt(110000, 659004)}`;
  const year = randomInt(1988, 2004);
  const month = String(randomInt(1, 12)).padStart(2, '0');
  const day = String(randomInt(1, 28)).padStart(2, '0');
  const seq = String(randomInt(100, 999));
  return `${area}${year}${month}${day}${seq}X`;
}

function buildHmtResidentId() {
  const prefix = rand(['810000', '820000', '830000']);
  const year = randomInt(1978, 2004);
  const month = String(randomInt(1, 12)).padStart(2, '0');
  const day = String(randomInt(1, 28)).padStart(2, '0');
  const seq = String(randomInt(1000, 9999));
  return `${prefix}${year}${month}${day}${seq}`;
}

function buildPassportNumber() {
  return `${rand(['E', 'G', 'P'])}${String(randomInt(10000000, 99999999))}`;
}

function buildDigitString(length = 6) {
  const size = Math.max(1, Number(length || 1));
  let result = '';
  for (let i = 0; i < size; i += 1) {
    result += String(randomInt(0, 9));
  }
  return result;
}

function buildCompanyId(hintText = '') {
  const hint = String(hintText || '');
  const isHKBrn = detectRegionByHint(hint) === 'hk' || /(商業登記|商业登记|商業登記證|商业登记证|business registration|registration number|\bbrn\b)/i.test(hint);
  if (isHKBrn) {
    return `${buildDigitString(8)}-${buildDigitString(3)}-${buildDigitString(2)}-${buildDigitString(2)}-${buildDigitString(2)}`;
  }
  const alphabet = 'ABCDEFGHJKLMNPQRTUWXY';
  const pickChar = () => alphabet[randomInt(0, alphabet.length - 1)];
  return `${pickChar()}${buildDigitString(7)}${pickChar()}${buildDigitString(9)}`;
}

function buildVerificationCode() {
  return String(randomInt(100000, 999999));
}

function buildDate() {
  const year = randomInt(2016, 2025);
  const month = String(randomInt(1, 12)).padStart(2, '0');
  const day = String(randomInt(1, 28)).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function buildDateMoreThanOneYear() {
  const now = new Date();
  const past = new Date(now);
  past.setFullYear(now.getFullYear() - randomInt(2, 8));
  past.setDate(Math.max(1, past.getDate() - randomInt(0, 20)));
  const y = past.getFullYear();
  const m = String(past.getMonth() + 1).padStart(2, '0');
  const d = String(past.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseYmdDate(value = '') {
  const text = String(value || '').trim();
  const match = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) return null;
  date.setHours(0, 0, 0, 0);
  return date;
}

function formatYmdDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function requiresAtLeastOneYearDate(hintText = '') {
  const hint = String(hintText || '');
  return /(一週年|一周年|滿足一週年|满一周年|滿一週年|超过一年|超過一年|一年或以上|滿一年|满一年|營運超過一年|运营超过一年|成立.{0,6}(一年|周年))/i.test(hint);
}

function ensureDateOlderThan(value = '', minDays = 366) {
  const cutoff = new Date();
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - Math.max(1, Number(minDays || 366)));
  const parsed = parseYmdDate(value);
  if (parsed && parsed.getTime() <= cutoff.getTime()) return formatYmdDate(parsed);
  const fallback = new Date(cutoff);
  fallback.setDate(fallback.getDate() - randomInt(30, 1800));
  return formatYmdDate(fallback);
}

function buildAddress() {
  const provincePack = rand(PROVINCES);
  const city = rand(provincePack.cities);
  const district = rand(provincePack.districts);
  const street = rand(STREETS);
  const roadNo = randomInt(10, 999);
  const building = randomInt(1, 12);
  const floor = randomInt(2, 22);
  const room = randomInt(101, 2208);
  const detail = `${street}${roadNo}号${building}号楼${floor}层${room}室`;

  return {
    province: provincePack.province,
    city,
    district,
    street: `${street}${roadNo}号`,
    building: `${building}号楼`,
    room: `${floor}层${room}室`,
    detail,
    full: `${provincePack.province}${city}${district}${detail}`
  };
}

function buildHongKongAddress() {
  const district = rand(HK_DISTRICTS);
  const street = rand(HK_STREETS);
  const roadNo = randomInt(8, 188);
  const building = ['中心', '商業大廈', '廣場', '工業中心', '大樓'][randomInt(0, 4)];
  const block = String.fromCharCode(65 + randomInt(0, 3));
  const floor = randomInt(2, 25);
  const room = randomInt(1, 18);
  const streetLine = `${street}${roadNo}號`;
  const roomLine = `${block}座${floor}樓${String(room).padStart(2, '0')}室`;
  const detail = `${streetLine}${building}${roomLine}`;
  return {
    province: '香港',
    city: '香港',
    district,
    street: streetLine,
    building: `${building}${block}座`,
    room: `${floor}樓${String(room).padStart(2, '0')}室`,
    detail,
    full: `香港${district}${detail}`
  };
}

function buildAddressByHint(hint) {
  const address = detectRegionByHint(hint) === 'hk' ? buildHongKongAddress() : buildAddress();

  if (/省份|省\//.test(hint)) return address.province;
  if (/城市|市\//.test(hint)) return address.city;
  if (/区县|地区|区域|区\//.test(hint)) return address.district;
  if (/室|樓|楼|大廈|大厦/.test(hint)) return `${address.building}${address.room}`;
  if (/街號|街号|街道|街名|路/.test(hint)) return address.street;
  if (/详细地址|地址详情|具体地址/.test(hint)) return address.detail;
  return address.full;
}

function buildStreetNoAndName(region = 'cn') {
  const address = region === 'hk' ? buildHongKongAddress() : buildAddress();
  return address.street;
}

function buildUnitFloorBuilding(region = 'hk') {
  const address = region === 'hk' ? buildHongKongAddress() : buildAddress();
  return `${address.building}${address.room}`;
}

function detectLangByHint(hint) {
  if (/(政府|government|bureau|department)/i.test(hint)) return 'gov';
  if (/(英文|\(英\)|（英）|_en|name_en|position_en|street_en|office_en|cert_name_en)/i.test(hint)) return 'en';
  if (/(中文|\(中\)|（中）|_cn|name_cn|position_cn|street_cn|office_cn|cert_name_cn)/i.test(hint)) return 'zh';
  return 'zh';
}

function buildJobTitle(lang = 'zh') {
  return lang === 'en' ? rand(EN_JOB_TITLES) : rand(CN_JOB_TITLES);
}

function buildWebsite(region = 'cn') {
  if (region === 'hk') return 'https://www.communitybridge.hk';
  if (region === 'en') return 'https://www.nova-bridge.com';
  return 'https://www.lingxi-bridge.cn';
}

function buildOrgMission(lang = 'zh') {
  if (lang === 'en') {
    return 'To strengthen inclusive community services through sustainable operations, digital coordination, and long-term public engagement.';
  }
  return rand(ORG_MISSION_TEXTS);
}

function buildServiceContent(lang = 'zh') {
  if (lang === 'en') {
    return 'Core services include community engagement, volunteer training, case referral, program operations, and public information support.';
  }
  return rand(SERVICE_CONTENT_TEXTS);
}

function buildCompanyIntro(lang = 'zh') {
  if (lang === 'en') {
    return 'The organization focuses on service operations, workflow management, and digital delivery with proven execution experience across public-service scenarios.';
  }
  return rand(COMPANY_INTRO_TEXTS);
}

function buildProjectPlan(lang = 'zh') {
  if (lang === 'en') {
    return 'The project will be delivered in phased milestones covering preparation, pilot rollout, validation, and scaled execution with iterative review.';
  }
  return rand(PROJECT_PLAN_TEXTS);
}

function buildStaffCount() {
  return String(randomInt(8, 280));
}

function buildMoneyAmount() {
  return String(randomInt(5000, 500000));
}

function buildPercentage() {
  return `${randomInt(5, 95)}%`;
}

function buildDateRecent() {
  const now = new Date();
  const past = new Date(now);
  past.setDate(now.getDate() - randomInt(1, 90));
  const y = past.getFullYear();
  const m = String(past.getMonth() + 1).padStart(2, '0');
  const d = String(past.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function buildDepartmentName() {
  return rand(DEPARTMENT_NAMES);
}

function buildSchoolName() {
  return rand(SCHOOL_NAMES);
}

function buildSemanticTextByHint(field, lang = 'zh') {
  const hint = `${field.label || ''} ${field.placeholder || ''} ${field.context || ''} ${field.selector || ''}`;
  const region = detectRegionByHint(hint);

  if (/(證書|证书|certificate|cert).*(顯示|显示|名稱|名称|name)|cert[_-]?name|display[_\s-]?name/i.test(hint)) {
    return buildCompanyName(lang);
  }
  if (/(公司|企業|企业|機構|机构|组织|政府|organization|organisation|bureau|department).*(名稱|名称|name)/i.test(hint)) {
    return buildCompanyName(lang);
  }
  if (/(街號及街名|街号及街名|street\s*no|street\s*name)/i.test(hint)) {
    return buildStreetNoAndName(region);
  }
  if (/(室[／/]?樓[／/]?大廈|室[／/]?楼[／/]?大厦|room\s*\/\s*floor\s*\/\s*block|flat\s*\/\s*floor\s*\/\s*block)/i.test(hint)) {
    return buildUnitFloorBuilding(region);
  }
  if (/(地址|address|街|路|号|號|樓|楼|室|區域|地區|地区|区域)/i.test(hint)) {
    return buildAddressByHint(hint);
  }
  if (/(邮箱|郵箱|電郵|email)/i.test(hint)) {
    return buildEmail([]);
  }
  if (/(电话|電話|mobile|phone|tel|手机号|聯絡電話|聯繫電話)/i.test(hint)) {
    return /固定|landline|telephone/i.test(hint)
      ? buildLandline()
      : (region === 'hk' ? buildHongKongPhone() : buildPhone());
  }
  if (/(职位|職稱|title|position)/i.test(hint)) {
    return buildJobTitle(lang);
  }
  if (/(姓名|first\s*name|last\s*name|given\s*name|family\s*name|surname|contact)/i.test(hint)) {
    return lang === 'en' ? buildEnglishName() : buildChineseName();
  }
  if (/(宗旨|mission|purpose|願景|愿景|目標|目标)/i.test(hint)) {
    return buildOrgMission(lang);
  }
  if (/(主要服務|服务內容|服务内容|service content|service scope|scope of service)/i.test(hint)) {
    return buildServiceContent(lang);
  }
  if (/(簡介|简介|introduction|profile|about us|background)/i.test(hint)) {
    return buildCompanyIntro(lang);
  }
  if (/(計劃|计划|implementation plan|project plan|执行方案)/i.test(hint)) {
    return buildProjectPlan(lang);
  }
  if (/(部門|部门|department)/i.test(hint)) {
    return buildDepartmentName();
  }
  if (/(學校|学校|university|college)/i.test(hint)) {
    return buildSchoolName();
  }
  if (/(全職|全职|人數|人数|staff count|employee count|headcount)/i.test(hint)) {
    return buildStaffCount();
  }
  if (/(金额|金額|money|price|fee|cost|total|budget)/i.test(hint)) {
    return buildMoneyAmount();
  }
  if (/(比例|percent|percentage|rate|佔比|占比)/i.test(hint)) {
    return buildPercentage();
  }
  if (/(url|网址|網站|域名|homepage|site|link)/i.test(hint)) {
    return buildWebsite(region === 'hk' ? 'hk' : lang);
  }

  return lang === 'en' ? rand(SHORT_SENTENCES_EN) : rand(SHORT_SENTENCES_ZH);
}

function chooseSelectValue(field = {}) {
  const options = Array.isArray(field.options) ? field.options : [];
  const hint = `${field.label || ''} ${field.placeholder || ''} ${field.context || ''}`;
  const region = detectRegionByHint(hint);
  const pickValue = (opt) => opt?.value || opt?.label || '';
  const pickRandomValue = (items) => pickValue(pickRandomItem(items));
  if (!options.length) {
    if (/(地區|地区|区域|區域|district|area|city|province|省|市|区)/i.test(hint)) {
      const address = region === 'hk' ? buildHongKongAddress() : buildAddress();
      if (/省/.test(hint)) return address.province;
      if (/市/.test(hint)) return address.city;
      if (/区|地區|地区|区域|區域|district|area/i.test(hint)) return address.district;
      return address.city;
    }
    if (/(稱謂|称谓|title_type|先生|女士|小姐|Mr|Ms|Mrs)/i.test(hint)) {
      return /english|英文|\(英\)|（英）|mr|ms|mrs/i.test(hint) ? 'Mr' : '先生';
    }
    if (/(是|否|yes|no|同意|不同意|agree|disagree)/i.test(hint)) {
      return /yes|no|english/i.test(hint) ? 'Yes' : '是';
    }
    if (/(企業|企业|公司|company)/i.test(hint)) return '企业';
    if (/(機構|机构|organisation|organization|org)/i.test(hint)) return '机构';
    if (/(政府|government)/i.test(hint)) return '政府';
    return '选项1';
  }

  const available = options.filter((opt) => String(opt.label || '').trim() && !/请选择|請選擇|选择|Select/.test(String(opt.label || '')));
  if (!available.length) return options[0]?.value || options[0]?.label || '';

  const pickByPatterns = (patterns) => {
    const hit = available.filter((opt) => patterns.some((pattern) => pattern.test(String(opt.label || ''))));
    return pickRandomValue(hit);
  };

  if (/(稱謂|称谓|title_type|先生|女士|小姐|Mr|Ms|Mrs)/i.test(hint)) {
    return pickByPatterns([/先生|Mr/i, /女士|小姐|Ms|Mrs/i]) || available[0].value || available[0].label;
  }
  if (/(地區|地区|区域|區域|district|area|city|province|省|市|区)/i.test(hint)) {
    return region === 'hk'
      ? (pickByPatterns([/中西|灣仔|东区|東區|觀塘|沙田|荃灣|屯門|元朗/i]) || available[0].value || available[0].label)
      : (pickByPatterns([/上海|广州|深圳|南京|苏州|成都|西安/i]) || available[0].value || available[0].label);
  }
  if (/(語言|语言|language)/i.test(hint)) {
    return pickByPatterns([/中文|繁體|简体|English/i]) || available[0].value || available[0].label;
  }
  if (/(是|否|yes|no|同意|不同意|agree|disagree)/i.test(hint)) {
    return pickByPatterns([/是|yes|同意|agree/i]) || available[0].value || available[0].label;
  }
  if (/(政府|government)/i.test(hint)) {
    return pickByPatterns([/政府|government/i]) || available[0].value || available[0].label;
  }
  if (/(企業|企业|公司|company)/i.test(hint)) {
    return pickByPatterns([/企業|企业|公司|company/i]) || available[0].value || available[0].label;
  }
  if (/(機構|机构|organisation|organization|org)/i.test(hint)) {
    return pickByPatterns([/機構|机构|organisation|organization|org/i]) || available[0].value || available[0].label;
  }

  return pickRandomValue(available);
}

function chooseChoiceValue(field = {}, allowMultiple = false) {
  const options = Array.isArray(field.options) ? field.options : [];
  const hint = `${field.label || ''} ${field.placeholder || ''} ${field.context || ''}`;
  const getOptionText = (opt) => (typeof opt === 'string' ? opt : (opt?.label || opt?.value || ''));
  const available = options.filter((opt) => String(getOptionText(opt)).trim());
  if (!available.length) return allowMultiple ? [] : '';

  const pickValue = (opt) => (typeof opt === 'string' ? opt : (opt?.value || opt?.label || ''));
  const pickByPatterns = (patterns) => {
    const hit = available.filter((opt) => patterns.some((pattern) => pattern.test(String(getOptionText(opt) || ''))));
    const choice = pickRandomItem(hit);
    return choice ? pickValue(choice) : '';
  };
  if (!allowMultiple) {
    if (/(是|否|有|沒有|没有|yes|no|同意|不同意|agree|disagree|是否|嗎|吗|有否)/i.test(hint)) {
      const positive = pickByPatterns([/^(有|是|同意|yes|agree)$/i, /有|是|同意|yes|agree/i]);
      if (positive) return positive;
    }
    const choice = pickRandomItem(available);
    return choice ? pickValue(choice) : '';
  }

  const choice = pickRandomItem(available);
  return choice ? [pickValue(choice)].filter(Boolean) : [];
}

function normalizePathKey(pathKey = '') {
  return String(pathKey || '').trim().toLowerCase();
}

function normalizeFingerprintValue(fingerprint = '') {
  return String(fingerprint || '').trim().toLowerCase();
}

function normalizeMatchToken(input = '') {
  return String(input || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[()（）【】\[\]{}<>《》"'“”‘’`~·•、，,。.:：;；/\\_|-]/g, '');
}

function isScopeMatched(scope = '', currentPathKey = '') {
  const scoped = normalizePathKey(scope);
  const current = normalizePathKey(currentPathKey);
  if (!scoped) return true;
  if (!current) return false;
  if (scoped === current) return true;
  return current.startsWith(scoped) || current.includes(scoped);
}

function collectMockRuleCandidates(settings = {}, currentPathKey = '', fieldFingerprint = '') {
  const rules = [];
  const pushRule = (rule = {}, source = 'legacy', basePriority = 0) => {
    if (!rule || typeof rule !== 'object') return;
    rules.push({
      ...rule,
      __source: source,
      __priority: Number(basePriority || 0)
    });
  };

  const center = settings.mockRuleCenter && typeof settings.mockRuleCenter === 'object'
    ? settings.mockRuleCenter
    : {};

  for (const rule of center.globalRules || []) {
    pushRule(rule, 'center:global', 100);
  }

  const normalizedPath = normalizePathKey(currentPathKey);
  for (const [scope, scopedRules] of Object.entries(center.scopedRules || {})) {
    if (!isScopeMatched(scope, normalizedPath)) continue;
    const priority = scope === normalizedPath ? 170 : 140;
    for (const rule of scopedRules || []) {
      pushRule({ ...rule, scope }, 'center:scope', priority);
    }
  }

  const normalizedFingerprint = normalizeFingerprintValue(fieldFingerprint);
  if (normalizedFingerprint) {
    for (const [fingerprint, fpRules] of Object.entries(center.fingerprintRules || {})) {
      if (normalizeFingerprintValue(fingerprint) !== normalizedFingerprint) continue;
      for (const rule of fpRules || []) {
        pushRule({ ...rule, fingerprint }, 'center:fingerprint', 220);
      }
    }
  }

  for (const rule of settings.mockRules || []) {
    pushRule(rule, 'legacy:flat', 80);
  }

  const dedup = new Map();
  for (const rule of rules) {
    const key = [
      normalizePathKey(rule.scope || rule.pathKey || ''),
      normalizeFingerprintValue(rule.fingerprint || ''),
      String(rule.kind || 'any').trim().toLowerCase(),
      String(rule.match || '').trim().toLowerCase(),
      String(rule.preset || '').trim().toLowerCase(),
      String(rule.value || '')
    ].join('|');
    const prev = dedup.get(key);
    if (!prev || Number(prev.updatedAt || 0) < Number(rule.updatedAt || 0)) {
      dedup.set(key, rule);
    }
  }
  return Array.from(dedup.values());
}

function findMockRule(field, settings = {}) {
  const haystack = `${field.label || ''} ${field.placeholder || ''} ${field.context || ''} ${field.selector || ''} ${field?.meta?.fieldFingerprint || ''}`.toLowerCase();
  const normalizedHaystack = normalizeMatchToken(haystack);
  const normalizedLabel = normalizeMatchToken(field.label || '');
  const normalizedPlaceholder = normalizeMatchToken(field.placeholder || '');
  const normalizedContext = normalizeMatchToken(field.context || '');
  const currentPathKey = normalizePathKey(field?.meta?.pathKey || settings.currentPathKey || '');
  const fieldFingerprint = normalizeFingerprintValue(field?.meta?.fieldFingerprint || field?.fingerprint || '');
  const candidates = collectMockRuleCandidates(settings, currentPathKey, fieldFingerprint);
  if (!candidates.length) return null;

  let best = null;
  let bestScore = -Infinity;
  for (const rule of candidates) {
    const kind = String(rule?.kind || '').trim().toLowerCase();
    const match = String(rule?.match || '').trim().toLowerCase();
    const normalizedMatch = normalizeMatchToken(match);
    const scope = normalizePathKey(rule?.scope || rule?.pathKey || '');
    const fingerprint = normalizeFingerprintValue(rule?.fingerprint || '');
    const fieldKind = String(field.kind || '').toLowerCase();
    const bridgeKindAllowed =
      kind &&
      kind !== 'any' &&
      kind !== fieldKind &&
      ['text', 'unknown', ''].includes(fieldKind) &&
      !!match;

    if (scope && !isScopeMatched(scope, currentPathKey)) continue;
    if (fingerprint && fingerprint !== fieldFingerprint) continue;
    if (kind && kind !== 'any' && kind !== fieldKind && !bridgeKindAllowed) continue;

    let score = Number(rule.__priority || 0);
    if (scope && scope === currentPathKey) score += 24;
    else if (scope) score += 10;
    if (fingerprint && fingerprint === fieldFingerprint) score += 40;
    if (kind === fieldKind) score += 16;
    else if (bridgeKindAllowed) score += 8;

    if (match) {
      const exactTokenMatched =
        (normalizedLabel && normalizedLabel === normalizedMatch) ||
        (normalizedPlaceholder && normalizedPlaceholder === normalizedMatch) ||
        (normalizedContext && normalizedContext === normalizedMatch);

      const containsMatched =
        (normalizedMatch && normalizedHaystack.includes(normalizedMatch)) ||
        (match && haystack.includes(match));

      if (exactTokenMatched) {
        score += 120;
        if (scope && scope === currentPathKey) score += 80;
      } else if (containsMatched) {
        score += 20;
      } else if (fieldKind === match) {
        score += 12;
      } else {
        continue;
      }

      score += Math.min(24, Math.max(0, normalizedMatch.length - 2));
    } else {
      score += kind && kind !== 'any' ? 4 : 1;
    }

    score += Math.min(6, Number(rule.hits || 0) * 0.25);
    score += Math.min(4, Number(rule.updatedAt || 0) / 1e13);

    if (score > bestScore) {
      bestScore = score;
      best = rule;
    }
  }
  return best || null;
}

function buildMockRuleValue(rule, field, lang = 'zh') {
  const preset = String(rule?.preset || '').trim();
  const rawValue = rule?.value == null ? '' : String(rule.value);
  const hint = `${field.label || ''} ${field.placeholder || ''} ${field.context || ''}`;
  const region = detectRegionByHint(hint);
  const phoneRegion = detectPhoneRegionByHint(hint, region || 'cn');
  const segmentedAddressField = Boolean(
    field?.meta?.segmented &&
    field?.meta?.addressSegment &&
    [FIELD_KINDS.ADDRESS_DETAIL, FIELD_KINDS.ADDRESS_COMPONENT, FIELD_KINDS.TEXT, FIELD_KINDS.UNKNOWN].includes(field?.kind || FIELD_KINDS.TEXT)
  );
  switch (preset) {
    case 'fixed':
      return rawValue;
    case 'cnPhone':
      return buildPhone();
    case 'hkPhone':
      return buildHongKongPhone();
    case 'moPhone':
    case 'macauPhone':
      return buildMacauPhone();
    case 'cnLandline':
    case 'landlineRandom':
      return buildLandline();
    case 'hkLandline':
      return `852-${randomInt(20000000, 39999999)}`;
    case 'cnFirstName':
      return buildFirstNameByLang('zh');
    case 'cnLastName':
      return buildLastNameByLang('zh');
    case 'enFirstName':
      return buildFirstNameByLang('en');
    case 'enLastName':
      return buildLastNameByLang('en');
    case 'cnName':
      return buildChineseName();
    case 'enName':
      return buildEnglishName();
    case 'companyZh':
      return buildCompanyName('zh');
    case 'companyEn':
      return buildCompanyName('en');
    case 'companyGov':
      return buildCompanyName('gov');
    case 'date':
      return requiresAtLeastOneYearDate(hint) ? buildDateMoreThanOneYear() : buildDate();
    case 'dateOld':
    case 'datePast':
      return buildDateMoreThanOneYear();
    case 'dateRecent':
      return buildDateRecent();
    case 'selectRandom':
      return chooseSelectValue(field);
    case 'radioRandom':
      return chooseChoiceValue(field, false);
    case 'checkboxRandom':
      return chooseChoiceValue(field, true);
    case 'address':
      return segmentedAddressField ? (region === 'hk' ? buildHongKongAddress() : buildAddress()) : buildAddressByHint(hint);
    case 'addressHk':
    case 'hkAddress':
      return segmentedAddressField ? buildHongKongAddress() : buildAddressByHint(`香港 ${hint}`);
    case 'emailRandom':
      return buildEmail([]);
    case 'phoneRandom':
      return phoneRegion === 'hk' ? buildHongKongPhone() : buildPhone();
    case 'websiteCn':
      return buildWebsite('cn');
    case 'websiteGlobal':
      return buildWebsite(region === 'hk' ? 'hk' : lang);
    case 'orgMission':
      return buildOrgMission(lang);
    case 'serviceContent':
      return buildServiceContent(lang);
    case 'companyIntro':
      return buildCompanyIntro(lang);
    case 'projectDescription':
    case 'projectPlan':
      return buildProjectPlan(lang);
    case 'employeeCount':
    case 'staffCount':
      return buildStaffCount();
    case 'amountBudget':
    case 'moneyAmount':
      return buildMoneyAmount();
    case 'percentage':
      return buildPercentage();
    case 'verificationCode':
      return buildVerificationCode();
    case 'jobTitleZh':
      return buildJobTitle('zh');
    case 'jobTitleEn':
      return buildJobTitle('en');
    case 'departmentName':
      return buildDepartmentName();
    case 'companyIdRandom':
      return buildCompanyId(hint);
    case 'cnIdcard':
    case 'idcardRandom':
      return buildIdcard();
    case 'hmtResidentId':
      return buildHmtResidentId();
    case 'passportNo':
      return buildPassportNumber();
    default:
      return rawValue;
  }
}

function resolveMockRuleValue(field, settings = {}, lang = 'zh') {
  const rule = findMockRule(field, settings);
  if (!rule) return null;
  return buildMockRuleValue(rule, field, lang);
}

function pickConfiguredName(settings = {}, lang = 'zh') {
  return pickConfiguredValue(settings, lang === 'en' ? 'englishName' : 'chineseName');
}

function pickConfiguredPhone(settings = {}, region = 'cn') {
  if (region === 'hk') return pickConfiguredValue(settings, 'mobile.hk');
  if (region === 'mo') return pickConfiguredValue(settings, 'mobile.mo');
  return pickConfiguredValue(settings, 'mobile.cn');
}

function pickConfiguredPhoneByHint(settings = {}, hint = '', region = 'cn') {
  if (/固定电话|固定電話|固話|固话|landline|telephone|tel/i.test(String(hint || ''))) {
    return pickConfiguredValue(settings, 'landline');
  }
  return pickConfiguredPhone(settings, region);
}

function pickConfiguredIdDocument(settings = {}, hint = '') {
  const text = String(hint || '');
  if (/护照|passport/i.test(text)) return pickConfiguredValue(settings, 'idDocument.passport');
  if (/港澳台|港澳臺|居民证|居民證|居住证|居住證|台胞|回乡|回鄉|hmt/i.test(text)) {
    return pickConfiguredValue(settings, 'idDocument.hmtResident');
  }
  return pickConfiguredValue(settings, 'idDocument.cnId');
}

function pickConfiguredText(settings = {}, hint = '') {
  if (/富文本|rich\s*text|editor|编辑器|編輯器|wysiwyg/i.test(String(hint || ''))) {
    return pickConfiguredValue(settings, 'richText');
  }
  return pickConfiguredValue(settings, 'plainText');
}

export function generateValueForField(field, settings = {}) {
  const configuredEmailPool = getTestDataPool(settings, 'email');
  const emailPool = settings.emailPoolEnabled === false ? [] : (configuredEmailPool.length ? configuredEmailPool : (settings.emailPoolList || []));
  const kind = field.kind;
  const hint = `${field.label || ''} ${field.placeholder || ''} ${field.context || ''}`;
  const lang = detectLangByHint(hint);
  const region = detectRegionByHint(hint);
  const phoneRegion = detectPhoneRegionByHint(hint, 'cn');

  const mockRuleValue = resolveMockRuleValue(field, settings, lang);
  if (mockRuleValue !== null && mockRuleValue !== undefined && String(mockRuleValue) !== '') {
    const isCompatibleMockValue = (() => {
      if (mockRuleValue == null) return false;
      if (typeof mockRuleValue === 'object') return false;
      const text = String(mockRuleValue).trim();
      if (!text) return false;
      if (kind === FIELD_KINDS.COMPANY_ID) {
        if (/[\u4e00-\u9fa5]/.test(text)) return false;
        return /[A-Za-z0-9]/.test(text) && text.replace(/[^A-Za-z0-9]/g, '').length >= 8;
      }
      if (kind === FIELD_KINDS.VERIFICATION) {
        return text.replace(/\D/g, '').length >= 4;
      }
      return true;
    })();

    const scalarKinds = new Set([
      FIELD_KINDS.COMPANY_ID,
      FIELD_KINDS.VERIFICATION,
      FIELD_KINDS.NUMBER,
      FIELD_KINDS.PHONE,
      FIELD_KINDS.TEL,
      FIELD_KINDS.IDCARD,
      FIELD_KINDS.FULL_NAME,
      FIELD_KINDS.FIRST_NAME,
      FIELD_KINDS.LAST_NAME,
      FIELD_KINDS.EMAIL
    ]);
    // 防止错误规则把结构化对象（如地址对象）塞进标量字段，导致分段证号/验证码填充异常。
    if (scalarKinds.has(kind) && typeof mockRuleValue === 'object') {
      // 忽略该错误规则值，继续走字段类型默认生成。
    } else if (scalarKinds.has(kind) && !isCompatibleMockValue) {
      // 标量字段命中了不兼容规则值（如 companyId 命中地址文本），忽略并回退。
    } else {
      if (kind === FIELD_KINDS.DATE && requiresAtLeastOneYearDate(hint)) {
        return ensureDateOlderThan(String(mockRuleValue), 366);
      }
      return mockRuleValue;
    }
  }

  const configuredValue = (() => {
    if (kind === FIELD_KINDS.FULL_NAME) return pickConfiguredName(settings, lang);
    if (kind === FIELD_KINDS.FIRST_NAME) {
      const name = pickConfiguredName(settings, lang);
      return name ? splitConfiguredName(name, 'first', lang) : null;
    }
    if (kind === FIELD_KINDS.LAST_NAME) {
      const name = pickConfiguredName(settings, lang);
      return name ? splitConfiguredName(name, 'last', lang) : null;
    }
    if (kind === FIELD_KINDS.EMAIL) return pickConfiguredValue(settings, 'email');
    if (kind === FIELD_KINDS.COMPANY_NAME) return pickConfiguredValue(settings, 'companyName');
    if (kind === FIELD_KINDS.COMPANY_ID) return pickConfiguredValue(settings, 'socialCreditCode');
    if (kind === FIELD_KINDS.TEL) return pickConfiguredValue(settings, 'landline');
    if (kind === FIELD_KINDS.PHONE) return pickConfiguredPhoneByHint(settings, hint, phoneRegion);
    if (kind === FIELD_KINDS.IDCARD) return pickConfiguredIdDocument(settings, hint);
    if (kind === FIELD_KINDS.NUMBER) return pickConfiguredValue(settings, 'number');
    if (kind === FIELD_KINDS.DATE) {
      const value = pickConfiguredValue(settings, 'date');
      return value && requiresAtLeastOneYearDate(hint) ? ensureDateOlderThan(value, 366) : value;
    }
    if (kind === FIELD_KINDS.ADDRESS_COMPONENT || kind === FIELD_KINDS.ADDRESS_DETAIL) return pickConfiguredValue(settings, 'address');
    if (kind === FIELD_KINDS.TEXT || kind === FIELD_KINDS.UNKNOWN) {
      return /富文本|rich\s*text|editor|编辑器|編輯器|wysiwyg/i.test(hint) ? pickConfiguredText(settings, hint) : null;
    }
    return null;
  })();
  if (configuredValue !== null && configuredValue !== undefined && String(configuredValue) !== '') {
    return configuredValue;
  }

  if (
    field?.meta?.segmented &&
    field?.meta?.addressSegment &&
    [FIELD_KINDS.ADDRESS_DETAIL, FIELD_KINDS.ADDRESS_COMPONENT, FIELD_KINDS.TEXT, FIELD_KINDS.UNKNOWN].includes(kind)
  ) {
    return region === 'hk' ? buildHongKongAddress() : buildAddress();
  }

  if (kind === FIELD_KINDS.COMPANY_NAME) return pickConfiguredValue(settings, 'companyName') || buildCompanyName(lang);
  if (kind === FIELD_KINDS.COMPANY_ID) return pickConfiguredValue(settings, 'socialCreditCode') || buildCompanyId(hint);
  if (kind === FIELD_KINDS.FULL_NAME) return lang === 'en' ? buildEnglishName() : buildChineseName();
  if (kind === FIELD_KINDS.FIRST_NAME) return buildFirstNameByLang(lang);
  if (kind === FIELD_KINDS.LAST_NAME) return buildLastNameByLang(lang);
  if (kind === FIELD_KINDS.EMAIL) return buildEmail(emailPool);
  if (kind === FIELD_KINDS.VERIFICATION) return buildVerificationCode();
  // 电话类字段强制按国际区号前缀分流：+852=>香港手机号，+86/无前缀=>大陆手机号
  if (kind === FIELD_KINDS.TEL) return phoneRegion === 'hk' ? `852-${randomInt(20000000, 39999999)}` : (phoneRegion === 'mo' ? `853-${randomInt(28000000, 89999999)}` : buildLandline());
  if (kind === FIELD_KINDS.PHONE) return phoneRegion === 'hk' ? buildHongKongPhone() : (phoneRegion === 'mo' ? buildMacauPhone() : buildPhone());
  if (kind === FIELD_KINDS.IDCARD) {
    if (/护照|passport/i.test(hint)) return buildPassportNumber();
    if (/港澳台|港澳臺|居民证|居民證|居住证|居住證|台胞|回乡|回鄉|hmt/i.test(hint)) return buildHmtResidentId();
    return buildIdcard();
  }
  if (kind === FIELD_KINDS.NUMBER) return String(randomInt(1, 9999));
  if (kind === FIELD_KINDS.SELECT) return chooseSelectValue(field);
  if (kind === FIELD_KINDS.DATE) {
    if (/成立|setup|成立日期|成立時間/.test(hint) || requiresAtLeastOneYearDate(hint)) return buildDateMoreThanOneYear();
    return buildDate();
  }
  if (kind === FIELD_KINDS.JOB_TITLE) return buildJobTitle(lang);
  if (kind === FIELD_KINDS.RADIO_GROUP) return chooseChoiceValue(field, false);
  if (kind === FIELD_KINDS.CHECKBOX_GROUP) return chooseChoiceValue(field, true);
  if (kind === FIELD_KINDS.ADDRESS_COMPONENT) return region === 'hk' ? buildHongKongAddress() : buildAddress();
  if (kind === FIELD_KINDS.ADDRESS_DETAIL) {
    return buildAddressByHint(hint);
  }
  if (kind === FIELD_KINDS.FILE) return '';

  if (/(公司|企業|企业|機構|机构|政府|government|organization|organisation|company).*(名稱|名称|name)|cert.*name/i.test(hint)) {
    return pickConfiguredValue(settings, 'companyName') || buildCompanyName(lang);
  }
  if (/(统一社会信用代码|統一社會信用代碼|社会信用代码|社會信用代碼|信用代码|信用代碼|納税人識別號|纳税人识别号|商業登記(?:證)?號(?:碼)?|商业登记(?:证)?号(?:码)?|商業登記|商业登记|商業登記證|商业登记证|brn|business registration(?: number| no\.?| #)?|registration number|證照編號|证照编号)/i.test(hint)) {
    return pickConfiguredValue(settings, 'socialCreditCode') || buildCompanyId(hint);
  }
  if (/(驗證碼|验证码|verify code|verification code)/i.test(hint)) {
    return buildVerificationCode();
  }
  if (/(職位|职位|職稱|position|title)/i.test(hint)) {
    return buildJobTitle(lang);
  }
  if (/(姓氏|姓\(中\)|姓\(英\)|last name|family name|surname)/i.test(hint)) {
    return buildLastNameByLang(lang);
  }
  if (/(名字|名\(中\)|名\(英\)|first name|given name)/i.test(hint)) {
    return buildFirstNameByLang(lang);
  }
  if (/邮箱|郵箱|電郵|email/i.test(hint)) return buildEmail(emailPool);
  if (/固定电话|固定電話|固話|固话|tel|telephone|landline/i.test(hint)) return pickConfiguredValue(settings, 'landline') || (phoneRegion === 'hk' ? `852-${randomInt(20000000, 39999999)}` : (phoneRegion === 'mo' ? `853-${randomInt(28000000, 89999999)}` : buildLandline()));
  if (/手机|電話|电话|流動電話|移动电话|mobile|phone/i.test(hint)) return phoneRegion === 'hk' ? buildHongKongPhone() : (phoneRegion === 'mo' ? buildMacauPhone() : buildPhone());
  if (/姓名|聯絡人|联系人|name/i.test(hint)) return pickConfiguredName(settings, lang) || (lang === 'en' ? buildEnglishName() : buildChineseName());
  if (/护照|passport/i.test(hint)) return buildPassportNumber();
  if (/港澳台|港澳臺|居民证|居民證|居住证|居住證|台胞|回乡|回鄉|hmt/i.test(hint)) return buildHmtResidentId();
  if (/证件|證件|身份证|身份證/i.test(hint)) return buildIdcard();
  if (/地址|通訊地址|通讯地址|省|市|区|樓|楼|室|街|區域|地區/.test(hint)) return pickConfiguredValue(settings, 'address') || buildAddressByHint(hint);
  if (field.kind === FIELD_KINDS.SELECT || /请选择|請選擇|下拉|選項|选项|combobox|dropdown/i.test(hint)) return chooseSelectValue(field);
  if (/日期|时间|date|time/i.test(hint)) {
    const value = pickConfiguredValue(settings, 'date');
    if (value) return (/成立/.test(hint) || requiresAtLeastOneYearDate(hint)) ? ensureDateOlderThan(value, 366) : value;
    return (/成立/.test(hint) || requiresAtLeastOneYearDate(hint)) ? buildDateMoreThanOneYear() : buildDate();
  }
  if (/宗旨|mission|purpose|願景|愿景|目標|目标/i.test(hint)) return buildOrgMission(lang);
  if (/主要服務|服务內容|服务内容|service content|service scope/i.test(hint)) return buildServiceContent(lang);
  if (/簡介|简介|profile|introduction|about us/i.test(hint)) return buildCompanyIntro(lang);
  if (/計劃|计划|implementation plan|project plan|执行方案/i.test(hint)) return buildProjectPlan(lang);
  if (/全職|全职|人數|人数|staff count|employee count|headcount/i.test(hint)) return buildStaffCount();
  if (/金额|金額|money|price|fee|cost|total|budget/i.test(hint)) return buildMoneyAmount();
  if (/比例|percent|percentage|rate|佔比|占比/i.test(hint)) return buildPercentage();
  if (/网址|網站|url|homepage|site|link/i.test(hint)) return buildWebsite(region === 'hk' ? 'hk' : lang);
  if (/富文本|rich\s*text|editor|编辑器|編輯器|wysiwyg/i.test(hint)) return pickConfiguredValue(settings, 'richText') || buildSemanticTextByHint(field, lang);

  return pickConfiguredValue(settings, 'plainText') || buildSemanticTextByHint(field, lang);
}

export function generateValues(fields = [], settings = {}) {
  const map = {};
  for (const field of fields) {
    map[field.id] = generateValueForField(field, settings);
  }
  return map;
}
