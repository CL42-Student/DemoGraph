const BASE = "https://api.census.gov/data";

const cache = new Map(); // key: `${state}${county}` → data object

export async function fetchCountyStats({ stateFIPS, countyFIPS }) {
  // Ensure countyFIPS is 3 digits (pad with zeros if needed)
  const countyFIPSStr = countyFIPS.toString().padStart(3, '0');
  const stateFIPSStr = stateFIPS.toString().padStart(2, '0');
  const key = `${stateFIPSStr}${countyFIPSStr}`;
  
  if (cache.has(key)) {
    return cache.get(key);
  }

  const apiKey = envKey();
  const subjURL = `${BASE}/2022/acs/acs5/subject?get=NAME,S1901_C01_012E,S2301_C04_001E,S2701_C03_001E&for=county:${countyFIPSStr}&in=state:${stateFIPSStr}${apiKey}`;
  const detURL = `${BASE}/2022/acs/acs5?get=NAME,B19001_001E,B19001_002E,B19001_003E,B19001_004E,B19001_005E,B19001_006E,B19001_007E,B19001_008E,B19001_009E,B19001_010E,B19001_011E,B19001_012E,B19001_013E,B19001_014E,B19001_015E,B19001_016E,B19001_017E&for=county:${countyFIPSStr}&in=state:${stateFIPSStr}${apiKey}`;

  try {
    const [subj, det] = await Promise.all([d3json(subjURL), d3json(detURL)]);

    if (!subj || subj.length < 2 || !det || det.length < 2) {
      throw new Error('Invalid response from Census API');
    }

    const subjRow = subj[1]; // [NAME, income, unemp%, insured%, state, county]
    const detRow = det[1];  // [NAME, total, b2...b17, state, county]

    const medianIncome = num(subjRow[1]);
    const unemployment = num(subjRow[2]);     // percent
    const insuredPct = num(subjRow[3]);     // percent

    const total = num(detRow[1]);
    const sum = arr => arr.reduce((a, v) => a + num(v), 0);

    const lt25 = sum(detRow.slice(2, 6));
    const p25_50 = sum(detRow.slice(6, 10));
    const p50_75 = sum(detRow.slice(10, 13));
    const p75_100 = sum(detRow.slice(13, 15));
    const gt100 = sum(detRow.slice(15, 18));

    const dist = [
      { label: "< $25,000", pct: pct(lt25, total) },
      { label: "$25,000 - $50,000", pct: pct(p25_50, total) },
      { label: "$50,000 - $75,000", pct: pct(p50_75, total) },
      { label: "$75,000 - $100,000", pct: pct(p75_100, total) },
      { label: "> $100,000", pct: pct(gt100, total) },
    ];

    const result = { 
      medianIncome, 
      unemployment, 
      insuredPct, 
      incomeDist: dist, 
      name: subjRow[0],
      source: 'ACS 5-year 2022',
      fips: key
    };
    cache.set(key, result);
    return result;
  } catch (error) {
    console.error('Census fetch error:', error);
    throw error;
  }
}

async function d3json(url) { 
  const r = await fetch(url); 
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json(); 
}

function num(x) { 
  const n = +x; 
  return Number.isFinite(n) ? n : null; 
}

function pct(n, d) { 
  return d > 0 ? +((100 * n / d).toFixed(1)) : 0; 
}

function envKey() { 
  const k = import.meta.env?.VITE_CENSUS_API_KEY; 
  return k ? `&key=${k}` : ""; 
}

