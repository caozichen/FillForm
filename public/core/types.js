export const FIELD_KINDS = {
  TEXT: 'text',
  COMPANY_NAME: 'companyName',
  COMPANY_ID: 'companyId',
  FULL_NAME: 'fullName',
  FIRST_NAME: 'firstName',
  LAST_NAME: 'lastName',
  EMAIL: 'email',
  VERIFICATION: 'verification',
  PHONE: 'phone',
  TEL: 'tel',
  IDCARD: 'idcard',
  NUMBER: 'number',
  BANK_CARD: 'bankCard',
  DATE: 'date',
  JOB_TITLE: 'jobTitle',
  RADIO_GROUP: 'radioGroup',
  CHECKBOX_GROUP: 'checkboxGroup',
  SELECT: 'select',
  ADDRESS_COMPONENT: 'addressComponent',
  ADDRESS_DETAIL: 'addressDetail',
  FILE: 'file',
  UNKNOWN: 'unknown'
};

export const DEFAULT_TEST_DATA_LIBRARY = {
  version: 1,
  enabled: true,
  pools: {
    chineseName: ['王晓彤', '李晨宇', '张雅楠'],
    englishName: ['Olivia Hall', 'Ethan Walker', 'Sophia Lewis'],
    mobile: {
      cn: ['13800138000', '13900139000', '18600001234'],
      hk: ['61234567', '92345678', '51239876'],
      mo: ['66123456', '68123456', '62881234']
    },
    companyName: ['灵犀科技有限公司', '启航信息技术有限公司', '星河数字科技有限公司'],
    socialCreditCode: ['91440300MA5K8X7P2Q', '91310115MA1H8Q6L5D', '9111000071093019X8'],
    email: [
      'shanshan_test@163.com',
      'shishanshan@lingxi360.cn',
      'hill971211@gmail.com'
    ],
    idDocument: {
      cnId: ['110101199001011234', '440305199508088888'],
      hmtResident: ['810000199001011234', '820000199201019876', '830000198805052468'],
      passport: ['E12345678', 'G98765432', 'PE1357924']
    },
    landline: ['021-62888888', '0755-26668888', '852-31234567', '853-28881234'],
    address: ['广东省深圳市南山区科技园路88号', '上海市浦东新区世纪大道100号', '香港灣仔區軒尼詩道88號'],
    date: ['2025-06-18', '2024-11-06', '2023-09-21'],
    plainText: ['这是一段用于表单测试的普通文本。', '请按实际业务流程完成后续审核。'],
    richText: [
      '<p><strong>测试标题：</strong>灵析已完成字段识别、规则匹配与自动填充校验。</p><p><font color="#2563eb">蓝色标记重点说明</font>，<font color="#16a34a">绿色标记流程通过</font>，请复核异常字段。</p>'
    ],
    number: ['35', '128', '500000'],
    bankCard: {
      cn: [
        '6222021000011000014',
        '6228482000022000028',
        '6216613000033000030',
        '6217004000044000040',
        '6225885000055000050'
      ],
      hk: [
        '6222436000066006',
        '5187107000077005',
        '4893008000088000'
      ]
    },
    file: {
      document: [],
      image: [],
      video: [],
      audio: [],
      archive: []
    }
  }
};

export const DEFAULT_SETTINGS = {
  mode: 'content',
  provider: 'heuristic',
  temperature: 0.2,
  floatingEnabled: true,
  inlinePanelEnabled: true,
  visiblePanelTabs: ['ui', 'qr'],
  fillRadioCheckbox: true,
  fillOptionalFields: true,
  paginateFillEnabled: false,
  debugLogs: true,
  emailPoolEnabled: true,
  emailPoolList: [
    'shanshan_test@163.com',
    'shishanshan@lingxi360.cn',
    'hill971211@gmail.com'
  ],
  mockRules: [],
  mockRuleCenter: {
    globalRules: [],
    scopedRules: {},
    fingerprintRules: {}
  },
  decryptConfig: {
    selectedProjectIds: [
      'hashids_international_refactor',
      'hashids_jiayou_mulan',
      'hashids_yangai'
    ],
    projects: [
      {
        id: 'hashids_international_refactor',
        name: '国际版重构',
        salt: 'gVTrpynQDcIGQKBgQDdC6mpDhGq0jq1exh',
        minLength: '6'
      },
      {
        id: 'hashids_jiayou_mulan',
        name: '加油木兰',
        salt: 'pm_basic',
        minLength: '6'
      },
      {
        id: 'hashids_yangai',
        name: '扬爱',
        salt: 'pm_basic',
        minLength: '6'
      }
    ]
  },
  testDataLibrary: DEFAULT_TEST_DATA_LIBRARY,
  fileUploadPaths: [],
  deepseek: {
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-chat',
    apiKey: ''
  },
  zhipu: {
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
    model: 'glm-5.2',
    apiKey: '',
    thinkingType: 'disabled',
    reasoningEffort: 'none',
    maxTokens: 1024
  },
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-5.5',
    reasoningEffort: 'xhigh',
    apiKey: ''
  }
};

export const STORAGE_KEYS = {
  SETTINGS: 'formPilotV2Settings',
  OVERLAY_POS: 'formPilotV2OverlayTop',
  TEMPLATES: 'formPilotV2Templates',
  FIELD_MAPPINGS: 'formPilotV2FieldMappings',
  MANUAL_FIELD_LIBRARY: 'formPilotV2ManualFieldLibrary'
};

export const FIELD_MAPPING_SCHEMA_VERSION = 2;

export const FIELD_MAPPING_MESSAGES = {
  GET: 'formpilotv2:get-field-mapping',
  GET_SELF: 'formpilotv2:get-field-mapping-self',
  SET: 'formpilotv2:set-field-mapping',
  SET_SELF: 'formpilotv2:set-field-mapping-self',
  LIST_TEMPLATES: 'formpilotv2:list-field-mapping-templates',
  SAVE_TEMPLATE: 'formpilotv2:save-field-mapping-template',
  APPLY_TEMPLATE: 'formpilotv2:apply-field-mapping-template',
  UPDATE_TEMPLATE: 'formpilotv2:update-field-mapping-template'
};
