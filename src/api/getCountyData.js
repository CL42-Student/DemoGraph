export async function getCountyData(stateCode, countyCode, apiKey) {
  const base = "https://api.census.gov/data/2022/acs/acs5";

  const variables = {
    core: [
      "NAME",
      "B01001_001E", // Total population
    ],
    ageBreakdown: [
      "B01001_020E", // Males 25-29 (example age band)
      "B01001_021E",
      "B01001_022E",
      "B01001_023E",
      "B01001_024E",
      "B01001_025E",
      // (you may expand these based on your preference)
    ],
    ethnicity: [
      "B03002_003E", // White alone
      "B03002_004E", // Black alone
      "B03002_012E", // Hispanic or Latino
    ],
    sameSexHouseholds: [
      // ✅ LGBTQ household proxy — ACS same-sex household count
      "B11009_001E", // Total households
      "B11009_002E", // Same-sex married households
      "B11009_003E", // Same-sex unmarried households
    ],
  };

  async function get(group) {
    const params = group.filter(Boolean).join(",");
    const url =
      `${base}?get=${params}&for=county:${countyCode}&in=state:${stateCode}&key=${apiKey}`;

    console.log("Census API Request:", url);

    const res = await fetch(url);

    if (!res.ok) {
      const text = await res.text();
      console.error("❌ Census API error response:", text);
      throw new Error("Census API returned 400");
    }

    return (await res.json())[1];
  }

  const [core, age, ethnicity, sameSex] = await Promise.all([
    get(variables.core),
    get(variables.ageBreakdown),
    get(variables.ethnicity),
    get(variables.sameSexHouseholds)
  ]);

  return {
    name: core[0],
    population: core[1],
    ageBreakdown: age,
    ethnicityBreakdown: ethnicity,
    lgbtqHouseholdEstimate: {
      totalHouseholds: sameSex[0],
      sameSexMarried: sameSex[1],
      sameSexUnmarried: sameSex[2]
    }
  };
}

