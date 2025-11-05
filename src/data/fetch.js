export async function fetchAgeBreakdown(fips, apiKey) {
  const url = `https://api.census.gov/data/2022/acs/acs5?get=NAME,B01001_003E,B01001_004E,B01001_005E,B01001_006E,B01001_007E,B01001_027E,B01001_028E,B01001_029E,B01001_030E,B01001_031E,B01001_012E,B01001_013E&for=county:${fips.slice(-3)}&in=state:${fips.slice(0,2)}&key=${apiKey}`;

  const res = await fetch(url);
  const data = (await res.json())[1];

  // Combine relevant age bins (simplified example)
  const maleYoung = +data[1] + +data[2];
  const femaleYoung = +data[6] + +data[7];
  const young = maleYoung + femaleYoung;

  // Cursor will expand this into full 5-category breakdown.
  return {
    "0–14": young,
    "15–24": +data[8],
    "25–44": +data[9],
    "45–64": +data[10],
    "65+": +data[11]
  };
}

export async function fetchLGBTQData(fips, apiKey) {
  const url = `https://api.census.gov/data/2022/acs/acs5?get=NAME,B11009_001E,B11009_002E&for=county:${fips.slice(-3)}&in=state:${fips.slice(0,2)}&key=${apiKey}`;

  const res = await fetch(url);
  const data = (await res.json())[1];

  const totalHouseholds = +data[1];
  const sameSexHouseholds = +data[2];

  const lgbtqIndex = totalHouseholds > 0 
    ? (sameSexHouseholds / totalHouseholds) * 100 
    : 0;

  return {
    totalHouseholds,
    sameSexHouseholds,
    lgbtqIndex
  };
}

