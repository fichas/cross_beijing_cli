export const VEHICLE_TYPE_MAP = {
  '01': '客车',
  '02': '货车',
};

export const LICENSE_PLATE_TYPE_MAP = {
  '02': '小型汽车',
  '01': '大型汽车',
  '52': '小型新能源汽车',
  '51': '大型新能源汽车',
  '06': '外籍汽车',
  '13': '低速车',
};

export const SOURCE = '99c4g1a438jgf412sa3xvckd43256h7g';

export const CONFIG_DIR = '.cross-bj';
export const CONFIG_FILE = 'config.json';

// API base URL (XOR-obfuscated to avoid plaintext in source)
const _k = 'cross-bj';
const _d = '0b061b0300174d450918155d195905064d100a1a19440c0d4d1500055d4e0c5051465b40';
export const API_BASE_URL = Buffer.from(_d, 'hex').map((b, i) => b ^ _k.charCodeAt(i % _k.length)).toString();
