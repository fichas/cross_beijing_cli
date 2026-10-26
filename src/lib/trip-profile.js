const LOCATIONS = ['inside', 'outside'];

function requiredText(value, field) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Missing trip setting: ${field}`);
  }
  return value.trim();
}

function coordinates(value, field, optional = false) {
  if (optional && value == null) return { longitude: '', latitude: '' };
  const result = {};
  for (const [key, max] of [['longitude', 180], ['latitude', 90]]) {
    const raw = value?.[key];
    if (!['string', 'number'].includes(typeof raw) || String(raw).trim() === '' ||
        !Number.isFinite(Number(raw)) || Math.abs(Number(raw)) > max) {
      throw new Error(`Invalid trip coordinate: ${field}.${key}`);
    }
    result[key] = String(raw);
  }
  return result;
}

export function validateApplyDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error('Apply date must be YYYY-MM-DD');
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error('Invalid apply date');
  }
  return value;
}

export function buildTripFields(defaults, location) {
  if (!LOCATIONS.includes(location)) {
    throw new Error('Select current location with --location inside|outside');
  }
  const destination = defaults?.destination;
  const purpose = defaults?.purpose;
  const destCoords = coordinates(destination, 'destination');
  // Device location is optional in the official form; never substitute a destination.
  const current = coordinates(defaults?.current_location, 'current_location', true);
  const result = {
    sfzj: location === 'inside' ? '1' : '0',
    sqdzgdjd: current.longitude,
    sqdzgdwd: current.latitude,
    area: requiredText(destination?.area, 'destination.area'),
    jjdq: requiredText(destination?.district_code, 'destination.district_code'),
    xxdz: requiredText(destination?.address, 'destination.address'),
    jjdzgdjd: destCoords.longitude,
    jjdzgdwd: destCoords.latitude,
    jjmd: requiredText(purpose?.code, 'purpose.code'),
    jjmdmc: requiredText(purpose?.name, 'purpose.name'),
    jjlk: '', jjlkmc: '', jjlkgdjd: '', jjlkgdwd: '',
    zjxxdz: '', zjxxdzgdjd: '', zjxxdzgdwd: '',
  };
  if (location === 'inside') {
    const address = defaults?.inside;
    const coords = coordinates(address, 'inside');
    result.zjxxdz = requiredText(address?.address, 'inside.address');
    result.zjxxdzgdjd = coords.longitude;
    result.zjxxdzgdwd = coords.latitude;
  } else {
    const road = defaults?.outside;
    const coords = coordinates(road, 'outside');
    result.jjlk = requiredText(road?.code, 'outside.code');
    result.jjlkmc = requiredText(road?.name, 'outside.name');
    result.jjlkgdjd = coords.longitude;
    result.jjlkgdwd = coords.latitude;
  }
  return result;
}
