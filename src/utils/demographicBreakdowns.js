// --- LGBTQ Household Indicator (ACS Table B11009) ---
// data.B11009_003E = Same-sex married households
// data.B11009_004E = Same-sex unmarried households
// data.B11009_001E = Total households

export function calculateLGBTQIndicator(data) {
  const sameSexHouseholds = Number(data.B11009_003E) + Number(data.B11009_004E);
  const householdsTotal = Number(data.B11009_001E);

  if (!householdsTotal) return null;

  return {
    percentSameSex: ((sameSexHouseholds / householdsTotal) * 100).toFixed(1),
    sameSexHouseholds,
    householdsTotal
  };
}

// --- Ethnicity Breakdown (ACS Table B03002) ---
export function computeEthnicityBreakdown(data) {
  const total = Number(data.B03002_001E);

  if (!total) return null;

  return {
    white: ((Number(data.B03002_003E) / total) * 100).toFixed(1),
    black: ((Number(data.B03002_004E) / total) * 100).toFixed(1),
    hispanic: ((Number(data.B03002_012E) / total) * 100).toFixed(1),
    asian: ((Number(data.B03002_006E) / total) * 100).toFixed(1),
    other: (
      (Number(data.B03002_007E) +
        Number(data.B03002_008E) +
        Number(data.B03002_009E) +
        Number(data.B03002_010E) +
        Number(data.B03002_011E)) /
      total *
      100
    ).toFixed(1),
  };
}

// --- Generational Breakdown (ACS B01001 Age Bins) ---
export function computeGenerationalBreakdown(data) {
  const total = Number(data.B01001_001E);
  if (!total) return null;

  // Age bin ranges (approx):
  // Gen Z: 0–24  → B01001_003 to _025
  // Millennial: 25–40 → B01001_026 to _031 & female matches
  // Gen X: 41–56 → bins around _032 to _041
  // Boomer: 57–75 → bins _042 to _049
  // Silent: 76+ → bins _050 to end

  function sumBins(keys) {
    return keys.reduce((sum, k) => sum + Number(data[k] || 0), 0);
  }

  const genZ = sumBins(['B01001_003E','B01001_004E','B01001_005E','B01001_006E','B01001_007E','B01001_008E','B01001_009E','B01001_010E','B01001_011E','B01001_012E','B01001_013E','B01001_014E', 'B01001_015E','B01001_016E','B01001_017E', 'B01001_018E','B01001_019E','B01001_020E','B01001_021E','B01001_022E','B01001_023E','B01001_024E','B01001_025E']);
  const millennial = sumBins(['B01001_026E','B01001_027E','B01001_028E','B01001_029E','B01001_030E','B01001_031E','B01001_044E','B01001_045E','B01001_046E','B01001_047E','B01001_048E','B01001_049E']);
  const genX = sumBins(['B01001_032E','B01001_033E','B01001_034E','B01001_035E','B01001_050E','B01001_051E','B01001_052E','B01001_053E']);
  const boomer = sumBins(['B01001_036E','B01001_037E','B01001_038E','B01001_039E','B01001_054E','B01001_055E','B01001_056E','B01001_057E']);
  const silent = sumBins(['B01001_040E','B01001_041E','B01001_042E','B01001_043E','B01001_058E','B01001_059E','B01001_060E','B01001_061E']);

  function pct(v) { return ((v / total) * 100).toFixed(1); }

  return {
    genZ: pct(genZ),
    millennial: pct(millennial),
    genX: pct(genX),
    boomer: pct(boomer),
    silent: pct(silent)
  };
}

