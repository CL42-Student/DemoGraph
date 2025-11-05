import * as d3 from "d3";
import { feature, mesh } from "topojson-client";
import { fetchCountyStats } from "./census.js";
import { computeEthnicityBreakdown, computeGenerationalBreakdown } from "./utils/demographicBreakdowns.js";
import Chart from 'chart.js/auto';

/** ---------- Constants & Handles ---------- **/
const svg = d3.select("svg");
const tooltip = d3.select("#tooltip");
const breadcrumb = d3.select("#breadcrumb");
const modal = d3.select("#modal");
const modalClose = d3.select("#modal-close");
const modalBody = d3.select("#modal-body");
const modalTitle = d3.select("#modal-title");
const modalSubtitle = d3.select("#modal-subtitle");
const minimapWrap = d3.select("#minimap");
const minimapSvg = minimapWrap.select("svg");
let countyHistory = [];
let pinnedBaselineFips = null;

const width = window.innerWidth;
const height = window.innerHeight;

// Ensure SVG has proper dimensions
svg.attr("width", width).attr("height", height);

const projection = d3.geoAlbersUsa().translate([width / 2, height / 2]).scale(1300);
const path = d3.geoPath(projection);

const g = svg.append("g");
const gStates = g.append("g").attr("data-layer", "states");
const gCounties = g.append("g").attr("data-layer", "counties");
const gBorders = g.append("g").attr("data-layer", "borders");

// Zoom behavior
const zoom = d3.zoom()
  .scaleExtent([1, 8])
  .on("zoom", (event) => {
    g.attr("transform", event.transform);
    updateMinimapViewport(event.transform);
  });

svg.call(zoom);

let currentState = null;
let states, counties, nationMesh;
let demographicsData = {};
let allStates = [];
let allCounties = [];

/** ---------- Load Data & Render ---------- **/
Promise.all([
  d3.json("/us-states.json"),
  d3.json("/us-counties.json"),
  d3.json("/demographics.json").catch(() => ({ data: {} }))
]).then(([usStatesTopo, usCountiesTopo, demographics]) => {
  allStates = feature(usStatesTopo, usStatesTopo.objects.states).features;
  allCounties = feature(usCountiesTopo, usCountiesTopo.objects.counties).features;
  states = allStates;
  counties = allCounties;
  demographicsData = demographics.data || {};
  nationMesh = mesh(usStatesTopo, usStatesTopo.objects.states, (a, b) => a !== b);

  drawStates(states);
  drawStateBorders(nationMesh);
  initMinimap(states);
  initUIHooks();
  exposeAppHooks();
});

/** ---------- History Panel ---------- **/
function recordCountyHistory(countyData) {
  countyHistory = countyHistory.filter(c => c.fips !== countyData.fips);
  countyHistory.unshift(countyData);
  countyHistory = countyHistory.slice(0, 10);
  renderHistoryPanel();
}

function renderHistoryPanel() {
  const container = document.getElementById("history-items");
  if (!container) return;
  container.innerHTML = "";

  // Sort history: pinned items first, then rest in chronological order
  const sortedHistory = [...countyHistory].sort((a, b) => {
    const aIsPinned = a.fips === pinnedBaselineFips;
    const bIsPinned = b.fips === pinnedBaselineFips;
    
    if (aIsPinned && !bIsPinned) return -1; // a comes first
    if (!aIsPinned && bIsPinned) return 1;  // b comes first
    // If both pinned or both unpinned, maintain original order (most recent first)
    return 0;
  });

  sortedHistory.forEach((entry) => {
    // Find original index in countyHistory for trend comparison
    const originalIndex = countyHistory.findIndex(c => c.fips === entry.fips);
    const trends = compareToBaseline(originalIndex);

    function icon(trend) {
      if (!trend) return "";
      if (trend === "up") return `<span class="trend up">▲</span>`;
      if (trend === "down") return `<span class="trend down">▼</span>`;
      return `<span class="trend same">•</span>`;
    }

    const isPinned = entry.fips === pinnedBaselineFips;

    const div = document.createElement("div");
    div.className = "history-item" + (isPinned ? " pinned" : "");

    div.innerHTML = `
      <div class="history-header">
        <strong>${entry.name}</strong>
        <span class="pin-btn">${isPinned ? "📌" : "📍"}</span>
      </div>
      Pop: ${entry.population?.toLocaleString() ?? "N/A"} ${icon(trends?.population)}<br>
      Median Age: ${entry.medianAge ?? "N/A"} ${icon(trends?.medianAge)}<br>
      Median Income: ${entry.medianIncome ? "$" + entry.medianIncome.toLocaleString() : "N/A"} ${icon(trends?.medianIncome)}
    `;

    // Clicking the card opens the county modal
    div.onclick = (e) => {
      if (!e.target.classList.contains("pin-btn")) {
        openCountyDetail(entry.fips);
      }
    };

    // Clicking the pin sets the baseline
    div.querySelector(".pin-btn").onclick = (e) => {
      e.stopPropagation();
      pinnedBaselineFips = isPinned ? null : entry.fips;
      renderHistoryPanel();
    };

    container.appendChild(div);
  });
}

function openCountyDetail(fips) {
  if (!fips) return;
  const f = fips.toString();
  const county = allCounties.find(c => c.id?.toString() === f);
  const stateId = f.slice(0, 2);
  const state = allStates.find(s => s.id?.toString() === stateId);
  if (county && state) {
    openCountyModal(county, state);
  }
}

function compareToBaseline(currentIndex) {
  if (countyHistory.length === 0) return null;

  const baseline = pinnedBaselineFips
    ? countyHistory.find(c => c.fips === pinnedBaselineFips)
    : countyHistory[0]; // fallback: most recent entry

  const curr = countyHistory[currentIndex];

  if (!baseline || !curr || baseline === curr) return null;

  function trend(a, b) {
    if (a == null || b == null) return null;
    if (a > b) return "up";
    if (a < b) return "down";
    return "same";
  }

  return {
    population: trend(curr.population, baseline.population),
    medianAge: trend(curr.medianAge, baseline.medianAge),
    medianIncome: trend(curr.medianIncome, baseline.medianIncome)
  };
}

/** ---------- Draw States ---------- **/
function drawStates(stateFeatures) {
  // Ensure defs exist for hover filter
  if (svg.select("defs").empty()) {
    const defs = svg.append("defs");
    const filter = defs.append("filter")
      .attr("id", "lift")
      .attr("x", "-20%")
      .attr("y", "-20%")
      .attr("width", "140%")
      .attr("height", "140%");
    filter.append("feDropShadow")
      .attr("dx", 0)
      .attr("dy", 1)
      .attr("stdDeviation", 2)
      .attr("flood-opacity", 0.25);
  }

  const statesSelection = gStates.selectAll("path.state")
    .data(stateFeatures, d => d.id);

  // ENTER
  const enter = statesSelection.enter()
    .append("path")
    .attr("class", "state")
    .attr("fill", "#228B22") // forest green
    .attr("stroke", "#fff")
    .attr("stroke-width", 0.8)
    .attr("cursor", "pointer")
    .attr("opacity", 0)
    .attr("d", path)
    .on("click", (event, d) => {
      event.stopPropagation();
      zoomToState(d);
    })
    .on("mousemove", (event, d) => {
      tooltip.style("opacity", 1)
        .style("left", event.pageX + 10 + "px")
        .style("top", event.pageY + "px")
        .html(`<strong>${d.properties.name}</strong><br/><small>Click to zoom</small>`);
    })
    .on("mouseleave", () => tooltip.style("opacity", 0))
    .on("mouseenter", function () { 
      d3.select(this).transition().duration(150).attr("filter", "url(#lift)"); 
    })
    .on("mouseleave", function () { 
      d3.select(this).transition().duration(150).attr("filter", null); 
    })
    .transition()
    .duration(600)
    .attr("opacity", 1)
    .ease(d3.easeCubicOut);

  // UPDATE (merge with enter)
  statesSelection.merge(enter)
    .attr("fill", "#228B22") // forest green - ensure default color
    .transition()
    .duration(600)
    .attr("d", path);
}

/** ---------- Draw Borders (static) ---------- **/
function drawStateBorders(meshData) {
  if (!meshData) return;
  
  gBorders.selectAll("path.border")
    .data([meshData])
    .join("path")
    .attr("class", "border")
    .attr("fill", "none")
    .attr("stroke", "#fff")
    .attr("stroke-width", 0.8)
    .attr("d", path)
    .attr("pointer-events", "none")
    .attr("opacity", 0)
    .transition().duration(600).attr("opacity", 1);
}

/** ---------- Zoom Logic ---------- **/
function zoomToState(state) {
  if (currentState && currentState.id === state.id) {
    return zoomOut();
  }

  currentState = state;

  // Dim neighbors
  gStates.selectAll("path.state")
    .classed("inactive", d => d.id !== state.id)
    .transition().duration(300)
    .attr("fill", d => d.id === state.id ? "#cfeeda" : "#228B22") // pastel green for selected, forest green for unselected
    .attr("opacity", d => d.id === state.id ? 1 : 0.6);

  // Compute transform for zoom fitting
  const b = path.bounds(state);
  const dx = b[1][0] - b[0][0];
  const dy = b[1][1] - b[0][1];
  const x = (b[0][0] + b[1][0]) / 2;
  const y = (b[0][1] + b[1][1]) / 2;
  const scale = Math.min(8, 0.9 / Math.max(dx / width, dy / height));
  const translate = [width / 2 - scale * x, height / 2 - scale * y];

  // Animate zoom
  svg.transition()
    .duration(750)
    .ease(d3.easeCubicInOut)
    .call(zoom.transform, d3.zoomIdentity.translate(translate[0], translate[1]).scale(scale))
    .on("end", () => revealCounties(state));

  showBreadcrumb(state);
  toggleMinimap(true);
}

function zoomOut() {
  currentState = null;

  // Remove counties with exit animation
  gCounties.selectAll("path.county")
    .transition()
    .duration(250)
    .attr("opacity", 0)
    .attr("transform", "scale(0.98)")
    .remove();

  // Restore states
  gStates.selectAll("path.state")
    .classed("inactive", false)
    .transition().duration(400)
    .attr("fill", "#228B22") // forest green
    .attr("opacity", 1);

  // Zoom out
  svg.transition()
    .duration(700)
    .ease(d3.easeCubicInOut)
    .call(zoom.transform, d3.zoomIdentity);

  hideBreadcrumb();
  toggleMinimap(false);
}

/** ---------- Counties Stagger Reveal ---------- **/
function revealCounties(state) {
  const stateId = state.id;
  const stateCounties = counties.filter(c => c.id.slice(0, 2) === stateId);

  const sel = gCounties.selectAll("path.county")
    .data(stateCounties, d => d.id);

  sel.enter()
    .append("path")
    .attr("class", "county")
    .attr("fill", "#228B22") // forest green
    .attr("stroke", "#fff")
    .attr("stroke-width", 0.3)
    .attr("cursor", "pointer")
    .attr("opacity", 0)
    .attr("transform", "scale(0.98)")
    .attr("d", path)
    .on("mousemove", (event, d) => {
      // Get county name from demographicsData if available, otherwise use FIPS
      const countyData = demographicsData[d.id];
      const countyName = countyData?.name 
        ? countyData.name.split(',')[0] 
        : (d.properties?.name || `County FIPS: ${d.id}`);
      
      tooltip.style("opacity", 1)
        .style("left", event.pageX + 10 + "px")
        .style("top", event.pageY + "px")
        .html(`<strong>${countyName}</strong><br/><small>FIPS: ${d.id}</small><br/><small>Click for cached • Double-click for fresh ACS</small>`);
    })
    .on("mouseleave", () => tooltip.style("opacity", 0))
    .on("click", (event, d) => {
      event.stopPropagation();
      openCountyModal(d, state);
    })
    .on("dblclick", async (event, d) => {
      event.stopPropagation();
      await openCountyModalWithACS(d, state);
    })
    .on("mouseenter", function() {
      d3.select(this).style("fill", "#cfeeda"); // pastel green on hover
    })
    .on("mouseleave", function() {
      d3.select(this).style("fill", "#228B22"); // forest green on leave
    })
    .transition()
    .delay((_, i) => 8 * i)
    .duration(300)
    .ease(d3.easeCubicOut)
    .attr("opacity", 1)
    .attr("transform", "scale(1)");

  // subtle hover pulse via transform (remove duplicate handlers)
  // Note: hover handlers are set in enter() above
}

/** ---------- Breadcrumb ---------- **/
function showBreadcrumb(state) {
  breadcrumb
    .classed("active", true)
    .html(`
      <span class="breadcrumb-segment" id="crumb-us">United States</span>
      <span class="breadcrumb-separator">›</span>
      <span class="breadcrumb-segment" id="crumb-state">${state.properties.name}</span>
    `);

  breadcrumb.style("opacity", 0)
    .transition().duration(250).style("opacity", 1);

  d3.select("#crumb-us").on("click", () => zoomOut());
  d3.select("#crumb-state").on("click", () => { 
    if (currentState) zoomToState(currentState); 
  });
}

function hideBreadcrumb() {
  breadcrumb.transition().duration(200).style("opacity", 0)
    .on("end", () => breadcrumb.classed("active", false).html(""));
}

/** ---------- Minimap ---------- **/
let miniProj = null;

function initMinimap(stateFeatures) {
  const bbox = { w: 120, h: 80 };
  minimapSvg.attr("viewBox", `0 0 ${bbox.w} ${bbox.h}`);

  miniProj = d3.geoAlbersUsa()
    .translate([bbox.w / 2, bbox.h / 2])
    .scale(150);
  const miniPath = d3.geoPath(miniProj);

  minimapSvg.append("g")
    .selectAll("path")
    .data(stateFeatures)
    .enter().append("path")
    .attr("d", miniPath)
    .attr("fill", "#e9ecef")
    .attr("stroke", "#adb5bd")
    .attr("stroke-width", 0.3);

  minimapSvg.append("rect")
    .attr("class", "minimap-viewport")
    .attr("x", 10).attr("y", 10)
    .attr("width", 40).attr("height", 20);

  toggleMinimap(false);
}

function toggleMinimap(show) {
  minimapWrap.classed("active", show);
}

function updateMinimapViewport(transform) {
  if (!miniProj || !currentState) return;
  
  try {
    const geoBounds = d3.geoBounds(currentState);
    const topLeftGeo = [geoBounds[0][0], geoBounds[1][1]];
    const bottomRightGeo = [geoBounds[1][0], geoBounds[0][1]];
    
    const topLeft = miniProj(topLeftGeo);
    const bottomRight = miniProj(bottomRightGeo);
    
    if (topLeft && bottomRight && 
        !isNaN(topLeft[0]) && !isNaN(topLeft[1]) &&
        !isNaN(bottomRight[0]) && !isNaN(bottomRight[1])) {
      const x = Math.min(topLeft[0], bottomRight[0]);
      const y = Math.min(topLeft[1], bottomRight[1]);
      const w = Math.abs(bottomRight[0] - topLeft[0]);
      const h = Math.abs(bottomRight[1] - topLeft[1]);
      
      minimapSvg.select("rect.minimap-viewport")
        .transition().duration(80)
        .attr("x", x).attr("y", y)
        .attr("width", w).attr("height", h);
    }
  } catch (e) {
    // Silently handle projection errors
  }
}

/** ---------- Chart Functions ---------- **/
function calculateGenerationalBreakdown(age) {
  console.log("🔍 calculateGenerationalBreakdown called with age data:", age);
  
  if (!age || typeof age !== 'object') {
    console.error("❌ calculateGenerationalBreakdown: age data is invalid:", age);
    return null;
  }
  
  // Safely sum age groups from ACS dataset
  const sum = (...keys) => keys.reduce((t, k) => t + (Number(age[k]) || 0), 0);

  const total = Object.values(age).reduce((a, b) => Number(a) + Number(b), 0);
  console.log("📊 Total population from age data:", total);

  if (total === 0) {
    console.warn("⚠️ calculateGenerationalBreakdown: Total is 0, returning zeros");
    return {
      "Gen Alpha": 0,
      "Gen Z": 0,
      "Millennials": 0,
      "Gen X": 0,
      "Baby Boomers": 0,
    };
  }

  const genAlpha = sum("Under 5 years", "5 to 9 years", "10 to 14 years");
  // Gen Z: 15-24 years (combining 15-17, 18-19, 20, 21, 22-24)
  const genZ = sum("15 to 17 years", "18 and 19 years", "20 years", "21 years", "22 to 24 years");
  const millennials = sum("25 to 29 years", "30 to 34 years", "35 to 39 years");
  const genX = sum("40 to 44 years", "45 to 49 years", "50 to 54 years");
  const boomers = sum(
    "55 to 59 years", "60 and 61 years", "62 to 64 years", "65 and 66 years",
    "67 to 69 years", "70 to 74 years", "75 to 79 years", "80 to 84 years", "85 years and over"
  );

  console.log("👥 Generation counts - Gen Alpha:", genAlpha, "Gen Z:", genZ, "Millennials:", millennials, "Gen X:", genX, "Boomers:", boomers);

  // Return both counts and percentages
  const result = {
    counts: {
      "Gen Alpha": genAlpha,
      "Gen Z": genZ,
      "Millennials": millennials,
      "Gen X": genX,
      "Baby Boomers": boomers,
    },
    percentages: {
      "Gen Alpha": Number(((genAlpha / total) * 100).toFixed(1)),
      "Gen Z": Number(((genZ / total) * 100).toFixed(1)),
      "Millennials": Number(((millennials / total) * 100).toFixed(1)),
      "Gen X": Number(((genX / total) * 100).toFixed(1)),
      "Baby Boomers": Number(((boomers / total) * 100).toFixed(1)),
    },
    total: total
  };
  
  console.log("✅ calculateGenerationalBreakdown result:", result);
  return result;
}

function drawGenerationalChart(genData) {
  console.log("🎨 drawGenerationalChart called with data:", genData);
  
  if (!genData) {
    console.error("❌ drawGenerationalChart: genData is null/undefined");
    return;
  }
  
  if (!genData.labels || !genData.values) {
    console.error("❌ drawGenerationalChart: genData missing labels or values", genData);
    return;
  }
  
  console.log("📋 Chart labels:", genData.labels);
  console.log("📊 Chart values:", genData.values);
  
  const canvas = document.getElementById("generationalChart");
  if (!canvas) {
    console.error("❌ drawGenerationalChart: Canvas element #generationalChart not found in DOM");
    return;
  }
  console.log("✅ Canvas element found:", canvas);

  if (typeof Chart === 'undefined') {
    console.error("❌ drawGenerationalChart: Chart.js is not loaded");
    return;
  }
  console.log("✅ Chart.js is available");

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    console.error("❌ drawGenerationalChart: Could not get 2d context from canvas");
    return;
  }

  if (window.generationalChart && typeof window.generationalChart.destroy === 'function') {
    console.log("🗑️ Destroying existing chart instance");
    window.generationalChart.destroy();
    window.generationalChart = null;
  }

  try {
    // Set fixed dimensions to prevent infinite expansion
    canvas.width = 420;
    canvas.height = 400;
    canvas.style.width = '420px';
    canvas.style.height = '400px';
    canvas.style.maxWidth = '100%';
    canvas.style.maxHeight = '400px';
    canvas.style.display = 'block';
    canvas.style.margin = '0 auto';
    
    // Use total population from genData if available, otherwise calculate from values
    const total = genData.total || genData.values.reduce((sum, val) => sum + val, 0);
    const percentages = genData.percentages || {};
    
    window.generationalChart = new Chart(ctx, {
      type: "pie",
      data: {
        labels: genData.labels,
        datasets: [{
          data: genData.values, // Use actual counts for chart sizing
          backgroundColor: [
            "#a8dadc",
            "#74c69d",
            "#40916c",
            "#1d3557",
            "#457b9d"
          ]
        }]
      },
      options: {
        responsive: false,
        maintainAspectRatio: false,
        layout: {
          padding: {
            top: 10,
            bottom: 10,
            left: 10,
            right: 10
          }
        },
        plugins: {
          legend: { 
            position: "bottom",
            labels: {
              padding: 10,
              boxWidth: 12,
              boxHeight: 12,
              font: {
                size: 11
              },
              usePointStyle: false,
              generateLabels: (chart) => {
                const data = chart.data;
                if (data.labels.length && data.datasets.length) {
                  return data.labels.map((label, i) => {
                    const dataset = data.datasets[0];
                    const value = dataset.data[i];
                    const percent = percentages[label] || (total > 0 ? ((value / total) * 100).toFixed(1) : '0.0');
                    return {
                      text: `${label} (${percent}%)`,
                      fillStyle: dataset.backgroundColor[i],
                      hidden: false,
                      index: i
                    };
                  });
                }
                return [];
              }
            }
          },
          tooltip: {
            enabled: true,
            callbacks: {
              label: (context) => {
                const label = context.label || '';
                const value = context.parsed || 0;
                const percent = percentages[label] || (total > 0 ? ((value / total) * 100).toFixed(1) : '0.0');
                return `${label}: ${percent}% (${value.toLocaleString()} people)`;
              }
            }
          },
          // Add percentage labels directly on pie slices
          afterDraw: (chart) => {
            const ctx = chart.ctx;
            const data = chart.data.datasets[0].data;
            const totalPop = genData.total || data.reduce((a, b) => a + b, 0);
            
            chart.data.datasets.forEach((dataset, i) => {
              const meta = chart.getDatasetMeta(i);
              meta.data.forEach((element, index) => {
                const value = dataset.data[index];
                const label = chart.data.labels[index];
                const percent = percentages[label] || (totalPop > 0 ? ((value / totalPop) * 100).toFixed(1) : '0.0');
                
                // Only show label if slice is large enough (> 3%)
                if ((value / totalPop) * 100 > 3) {
                  const position = element.tooltipPosition();
                  ctx.save();
                  ctx.fillStyle = '#fff';
                  ctx.font = 'bold 13px Arial';
                  ctx.textAlign = 'center';
                  ctx.textBaseline = 'middle';
                  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
                  ctx.lineWidth = 2;
                  ctx.strokeText(`${percent}%`, position.x, position.y);
                  ctx.fillText(`${percent}%`, position.x, position.y);
                  ctx.restore();
                }
              });
            });
          }
        }
      }
    });
    console.log("✅ Chart created successfully:", window.generationalChart);
  } catch (error) {
    console.error("❌ Error creating chart:", error);
  }
}

/** ---------- Modal + Animated Stats ---------- **/
function openCountyModal(county, state) {
  const fipsCode = county.id;
  const data = demographicsData[fipsCode];
  
  if (!data) {
    fetchCountyDemographics(fipsCode, state.properties.name);
    return;
  }
  
  modalTitle.text(data.name ? data.name.split(',')[0] : `County FIPS: ${fipsCode}`);
  modalSubtitle.text(state.properties.name);
  modalBody.html(buildCountyStatsHTML(county, state, data));
  modal.classed("active", true);
  recordCountyHistory({ 
    fips: data.fips || fipsCode, 
    name: data.name || `County ${fipsCode}`,
    population: data.population ?? null,
    medianAge: data.medianAge ?? null,
    medianIncome: data.income?.medianHousehold ?? null
  });
  
  setTimeout(() => {
    animateStatBars();
    animateSparkline(data);
    initCollapsibles();
  }, 50);
  
  // After inserting modal HTML into the DOM:
  setTimeout(() => {
    console.log("🔍 openCountyModal: Checking for age data in data object:", data);
    console.log("🔍 data.age exists?", !!data.age, "data.age value:", data.age);
    
    // Generational breakdown percentages are already displayed in the HTML list
    // No chart rendering needed
  }, 0);
}

function fetchCountyDemographics(fipsCode, stateName) {
  modalTitle.text(`Loading...`);
  modalSubtitle.text(`FIPS: ${fipsCode}`);
  modalBody.html(`
    <div class="stats-section" style="text-align: center; padding: 40px 20px;">
      <div style="font-size: 48px; margin-bottom: 20px;">⏳</div>
      <p style="color: #666; font-size: 16px;">
        Fetching demographic data from U.S. Census Bureau...
      </p>
    </div>
  `);
  modal.classed("active", true);

  const stateFIPS = fipsCode.substring(0, 2);
  const countyFIPS = fipsCode.substring(2);

  fetchCensusData(stateFIPS, countyFIPS, fipsCode)
    .then(data => {
      if (data) {
        demographicsData[fipsCode] = data;
        
        modalTitle.text(data.name ? data.name.split(',')[0] : `County FIPS: ${fipsCode}`);
        modalSubtitle.text(stateName);
        modalBody.html(buildCountyStatsHTML(null, { properties: { name: stateName } }, data));
        recordCountyHistory({ 
          fips: data.fips || fipsCode, 
          name: data.name || `County ${fipsCode}`,
          population: data.population ?? null,
          medianAge: data.medianAge ?? null,
          medianIncome: data.income?.medianHousehold ?? null
        });
        setTimeout(() => {
          animateStatBars();
          animateSparkline(data);
          initCollapsibles();
        }, 50);
        
        // After inserting modal HTML into the DOM:
        setTimeout(() => {
          console.log("🔍 fetchCountyDemographics: Checking for age data in data object:", data);
          console.log("🔍 data.age exists?", !!data.age, "data.age value:", data.age);
          
          // Generational breakdown percentages are already displayed in the HTML list
          // No chart rendering needed
        }, 0);
      } else {
        showFetchError(fipsCode, stateName);
      }
    })
    .catch(error => {
      console.error('Error fetching county data:', error);
      showFetchError(fipsCode, stateName, error.message);
    });
}

function showFetchError(fipsCode, stateName, errorMessage = null) {
  modalTitle.text(`County FIPS: ${fipsCode}`);
  modalSubtitle.text(stateName || '');
  modalBody.html(`
    <div class="stats-section">
      <div style="text-align: center; padding: 20px;">
        <div style="font-size: 48px; margin-bottom: 20px;">⚠️</div>
        <p style="color: #666; font-size: 16px; margin-bottom: 10px;">
          Unable to fetch demographic data
        </p>
        ${errorMessage ? `<p style="color: #999; font-size: 12px;">Error: ${errorMessage}</p>` : ''}
      </div>
    </div>
  `);
}

modalClose.on("click", closeModal);
modal.on("click", (e) => { 
  if (e.target === modal.node()) closeModal(); 
});

d3.select("body").on("keydown", function(event) {
  if (event.key === "Escape") {
    if (modal.classed("active")) {
      closeModal();
    } else if (currentState) {
      zoomOut();
    }
  }
});

function closeModal() {
  modal.classed("active", false);
}

/** ---------- Toast Helper ---------- **/
function toast(message, duration = 3000) {
  const toastEl = d3.select("#toast");
  toastEl.text(message);
  toastEl.style("display", "block").classed("show", true);
  
  setTimeout(() => {
    toastEl.classed("show", false);
    setTimeout(() => toastEl.style("display", "none"), 300);
  }, duration);
}

/** ---------- Loading Overlay ---------- **/
function showLoading() {
  d3.select("#loading-overlay").style("display", "flex");
}

function hideLoading() {
  d3.select("#loading-overlay").style("display", "none");
}

/** ---------- ACS Data Modal ---------- **/
async function openCountyModalWithACS(county, state) {
  const stateFIPS = county.id.toString().slice(0, 2);
  const countyFIPS = county.id.toString().slice(2, 5);
  
  showLoading();
  
  try {
    const stats = await fetchCountyStats({ stateFIPS, countyFIPS });
    openCountyModalWithStats(county, state, stats);
    hideLoading();
  } catch (e) {
    console.error('ACS fetch failed:', e);
    toast("Census fetch failed. Showing cached data.", 4000);
    hideLoading();
    // Fallback to cached data if available
    const fipsCode = county.id;
    const data = demographicsData[fipsCode];
    if (data) {
      openCountyModal(county, state);
    } else {
      openCountyModal(county, state);
    }
  }
}

function openCountyModalWithStats(county, state, stats) {
  const { medianIncome, unemployment, insuredPct, incomeDist, name, source } = stats;
  
  const formatCurrency = (num) => num ? `$${Math.round(num).toLocaleString()}` : '—';
  const formatPercent = (num) => num !== null ? `${num.toFixed(1)}%` : '—';
  
  // Calculate demographic breakdowns for this function's HTML
  const ethnicity = computeEthnicityBreakdown(stats);
  
  // Calculate generations from age data if available
  let generations = null;
  if (stats.age) {
    const breakdown = calculateGenerationalBreakdown(stats.age);
    generations = breakdown ? breakdown.percentages : null;
  } else {
    // Fallback to old method if age data not available
    generations = computeGenerationalBreakdown(stats);
  }
  
  modalTitle.text(`${name || (county.properties?.name || 'County')} — ACS 2022`);
  modalSubtitle.text(state.properties.name);
  
  let html = `
    <div class="stats-section">
      <h3>Overview</h3>
      <div class="stat-row" title="S1901_C01_012E — ACS 5-year 2022">
        <span class="stat-label">Median HH Income</span>
        <span class="stat-value">${formatCurrency(medianIncome)}</span>
      </div>
      <div class="stat-row" title="S2301_C04_001E — ACS 5-year 2022">
        <span class="stat-label">Unemployment Rate</span>
        <span class="stat-value">${formatPercent(unemployment)}</span>
      </div>
      <div class="stat-row" title="S2701_C03_001E — ACS 5-year 2022">
        <span class="stat-label">Insured</span>
        <span class="stat-value">${formatPercent(insuredPct)}</span>
      </div>
      <div class="source-note" style="margin-top: 12px;">
        Source: ACS 5-year (2022), tables S1901, S2301, S2701, B19001
      </div>
    </div>
    <div id="age-chart" class="chart-section"></div>
    <div id="ethnicity-chart" class="chart-section"></div>

    <div class="stats-section">
      <div class="collapsible-header">
        <h3 style="margin: 0; display: inline;">Income Distribution</h3>
        <span class="collapsible-icon">▲</span>
      </div>
      <div class="collapsible-content expanded">
        ${incomeDist.map(({label, pct}) => `
          <div class="income-bracket">
            <div class="stat-row">
              <span class="stat-label">${label}</span>
              <span class="stat-value"><span class="bar-value" data-target="${pct}">0%</span></span>
            </div>
            <div class="stat-bar-container">
              <div class="stat-bar" style="width:0%"></div>
            </div>
          </div>
        `).join("")}
        <div style="font-size: 11px; color: #6c757d; margin-top: 8px; padding-top: 8px; border-top: 1px solid #e0e0e0;">
          Values show % of households
        </div>
      </div>
    </div>
    
    ${ethnicity ? `
    <div class="stats-section" style="margin-top: 24px;">
      <h2 style="font-size: 20px; font-weight: 600; margin-bottom: 12px;">Community & Demographic Composition</h2>
      <div style="margin-bottom: 16px; padding: 12px; border-radius: 8px; border: 1px solid #d1d5db; background: #f3f7ff;">
        <h3 style="font-size: 18px; font-weight: 500; margin-bottom: 8px;">Ethnicity Composition</h3>
        <ul style="margin-top: 8px; padding-left: 0; list-style: none; font-size: 14px;">
          <li style="margin-bottom: 4px;">White (Non-Hispanic): <strong>${ethnicity.white}%</strong></li>
          <li style="margin-bottom: 4px;">Black or African American: <strong>${ethnicity.black}%</strong></li>
          <li style="margin-bottom: 4px;">Hispanic / Latino: <strong>${ethnicity.hispanic}%</strong></li>
          <li style="margin-bottom: 4px;">Asian: <strong>${ethnicity.asian}%</strong></li>
          <li style="margin-bottom: 4px;">Other / Multiracial: <strong>${ethnicity.other}%</strong></li>
        </ul>
      </div>
    </div>
    ` : ''}
    
    ${generations ? `
    <div class="stats-section" style="margin-top: 24px;">
      <h2 style="font-size: 20px; font-weight: 600; margin-bottom: 12px;">Community & Demographic Composition</h2>
      <div style="padding: 12px; border-radius: 8px; border: 1px solid #d1d5db; background: #fff8e8;">
        <h3 style="font-size: 18px; font-weight: 500; margin-bottom: 8px;">Generational Distribution</h3>
        <ul style="margin-top: 8px; padding-left: 0; list-style: none; font-size: 14px;">
          ${generations["Gen Alpha"] ? `<li style="margin-bottom: 4px;">Gen Alpha (0–14): <strong>${generations["Gen Alpha"]}%</strong></li>` : ''}
          <li style="margin-bottom: 4px;">Gen Z (15–24): <strong>${generations["Gen Z"]}%</strong></li>
          <li style="margin-bottom: 4px;">Millennials (25–39): <strong>${generations["Millennials"]}%</strong></li>
          <li style="margin-bottom: 4px;">Gen X (40–54): <strong>${generations["Gen X"]}%</strong></li>
          <li style="margin-bottom: 4px;">Baby Boomers (55+): <strong>${generations["Baby Boomers"]}%</strong></li>
        </ul>
        <div style="margin-top: 12px;">
          ${Object.entries(generations).map(([label, value]) => `
            <div style="margin-bottom: 4px;">
              <div style="font-size: 12px; margin-bottom: 4px; text-transform: capitalize;">
                ${label} — ${value}%
              </div>
              <div style="height: 8px; width: 100%; background-color: #e5e7eb; border-radius: 4px; overflow: hidden;">
                <div
                  style="height: 100%; width: ${value}%; background-color: #3b82f6; border-radius: 4px; transition: width 0.3s ease;"
                ></div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    </div>
    ` : ''}
  `;
  
  modalBody.html(html);
  modal.classed("active", true);
  recordCountyHistory({ 
    fips: stats.fips, 
    name: stats.name || (county.properties?.name || 'County'),
    population: null,
    medianAge: null,
    medianIncome: stats.medianIncome ?? null
  });
  
  setTimeout(() => {
    animateStatBars();
    initCollapsibles();
  }, 50);
  
  // After inserting modal HTML into the DOM:
  setTimeout(() => {
    console.log("🔍 openCountyModalWithStats: Checking for age data in stats object:", stats);
    console.log("🔍 stats.age exists?", !!stats.age, "stats.age value:", stats.age);
    
    // Generational breakdown percentages are already displayed in the HTML list
    // No chart rendering needed
  }, 0);
}

function buildCountyStatsHTML(county, state, data) {
  const formatNumber = (num) => num.toLocaleString();
  const formatCurrency = (num) => `$${num.toLocaleString()}`;
  const formatPercent = (num) => `${num.toFixed(1)}%`;
  
  const countyName = data.name ? data.name.split(',')[0] : (county ? `County FIPS: ${county.id}` : 'County');
  const pop = data.population || 0;
  const medianIncome = data.income?.medianHousehold || null;
  const medianAge = data.medianAge || null;
  const male = data.gender?.male || 50;
  const female = data.gender?.female || 50;
  
  // Calculate state median income from all counties in the state (for comparison)
  const stateId = county ? county.id.toString().substring(0, 2) : null;
  let stateMedianIncome = null;
  if (stateId) {
    const stateCounties = Object.values(demographicsData)
      .filter(d => d.fips && d.fips.toString().startsWith(stateId) && d.income?.medianHousehold);
    if (stateCounties.length > 0) {
      const incomes = stateCounties.map(d => d.income.medianHousehold).sort((a, b) => a - b);
      const mid = Math.floor(incomes.length / 2);
      stateMedianIncome = incomes.length % 2 === 0 
        ? (incomes[mid - 1] + incomes[mid]) / 2 
        : incomes[mid];
    }
  }
  
  // Collect all county incomes for distribution
  const allCountyIncomes = Object.values(demographicsData)
    .filter(d => d.income?.medianHousehold && d.income.medianHousehold > 0)
    .map(d => d.income.medianHousehold)
    .sort((a, b) => a - b);
  
  // Calculate percentile for selected county
  let countyPercentile = null;
  if (medianIncome && allCountyIncomes.length > 0) {
    const below = allCountyIncomes.filter(inc => inc < medianIncome).length;
    countyPercentile = Math.round((below / allCountyIncomes.length) * 100);
  }
  
  // Prepare histogram data
  const histogramData = {
    allIncomes: allCountyIncomes,
    countyIncome: medianIncome,
    stateMedian: stateMedianIncome,
    countyPercentile: countyPercentile
  };

  let html = `
    <div class="stats-section">
      <h3>Population & Age</h3>
      <div class="stat-row">
        <span class="stat-label">Total Population</span>
        <span class="stat-value">${formatNumber(pop)}</span>
      </div>
      ${medianAge ? `
      <div class="stat-row">
        <span class="stat-label">Median Age</span>
        <span class="stat-value">${medianAge} years</span>
      </div>
      ` : ''}
      ${data.gender ? `
      <div class="stat-row">
        <span class="stat-label">Gender</span>
        <span class="stat-value">${formatPercent(male)} M / ${formatPercent(female)} F</span>
      </div>
      <div class="gender-bar" aria-label="Gender ratio">
        <div class="gender-segment gender-male" style="width:${male}%">${male > 15 ? formatPercent(male) : ''}</div>
        <div class="gender-segment gender-female" style="width:${female}%">${female > 15 ? formatPercent(female) : ''}</div>
      </div>
      ` : ''}
    </div>
    <div id="age-chart" class="chart-section"></div>
    <div id="ethnicity-chart" class="chart-section"></div>
  `;

  if (medianIncome) {
    const comparison = stateMedianIncome 
      ? `${medianIncome > stateMedianIncome ? '+' : ''}${formatCurrency(medianIncome - stateMedianIncome)} vs state median`
      : 'State comparison unavailable';
    
    html += `
      <div class="stats-section">
        <h3>Income</h3>
        <div class="stat-row">
          <span class="stat-label">Median Household Income</span>
          <span class="stat-value">${formatCurrency(medianIncome)}</span>
        </div>
        ${stateMedianIncome ? `
        <div class="stat-row">
          <span class="stat-label">vs State Median</span>
          <span class="stat-value" style="color: ${medianIncome >= stateMedianIncome ? '#28a745' : '#dc3545'}">
            ${medianIncome >= stateMedianIncome ? '↑' : '↓'} ${comparison}
          </span>
        </div>
        ` : ''}
        <div class="sparkline-container" style="margin-top: 12px;">
          <div style="font-size: 11px; color: #6c757d; margin-bottom: 4px;">
            ${countyPercentile !== null ? `Income Distribution: ${countyName} is in the ${countyPercentile}th percentile` : 'Income Level Indicator'}
          </div>
          <svg class="sparkline" data-histogram='${JSON.stringify(histogramData)}'></svg>
        </div>
      </div>
    `;
  }

  // Community and Demographic Composition - Generational Breakdown
  console.log("🔍 buildCountyStatsHTML: Checking for age data in data object:", data);
  console.log("🔍 data.age exists?", !!data.age, "data.age value:", data.age);
  
  if (data.age) {
    console.log("✅ Age data found in buildCountyStatsHTML, calculating breakdown...");
    const generationBreakdown = calculateGenerationalBreakdown(data.age);
    if (generationBreakdown && generationBreakdown.percentages) {
      console.log("📝 Adding generational breakdown HTML section");
      html += `
        <div class="stats-section">
          <h3>Community and Demographic Composition</h3>
          <div class="info-section">
            <ul class="demographic-list">
              <li><strong>Gen Alpha (≈ ages 0–14):</strong> ${generationBreakdown.percentages["Gen Alpha"].toFixed(1)}%</li>
              <li><strong>Gen Z (≈ ages 15–24):</strong> ${generationBreakdown.percentages["Gen Z"].toFixed(1)}%</li>
              <li><strong>Millennials (≈ ages 25–39):</strong> ${generationBreakdown.percentages["Millennials"].toFixed(1)}%</li>
              <li><strong>Gen X (≈ ages 40–54):</strong> ${generationBreakdown.percentages["Gen X"].toFixed(1)}%</li>
              <li><strong>Baby Boomers (≈ ages 55+):</strong> ${generationBreakdown.percentages["Baby Boomers"].toFixed(1)}%</li>
            </ul>
          </div>
        </div>
      `;
    } else {
      console.warn("⚠️ buildCountyStatsHTML: Breakdown calculation returned null");
    }
  } else {
    console.warn("⚠️ buildCountyStatsHTML: No age data found in data object");
  }

  if (data.income?.brackets) {
    html += `
      <div class="stats-section">
        <div class="collapsible-header">
          <h3 style="margin: 0; display: inline;">Income Distribution</h3>
          <span class="collapsible-icon">▲</span>
        </div>
        <div class="collapsible-content expanded">
          ${Object.entries({
            "under25k": "Under $25,000",
            "25k-50k": "$25,000 - $50,000",
            "50k-75k": "$50,000 - $75,000",
            "75k-100k": "$75,000 - $100,000",
            "100k-150k": "$100,000 - $150,000",
            "150k+": "$150,000+"
          }).map(([key, label]) => {
            const v = data.income.brackets[key] || 0;
            return `
              <div class="income-bracket">
                <div class="stat-row">
                  <span class="stat-label">${label}</span>
                  <span class="stat-value"><span class="bar-value" data-target="${v}">0%</span></span>
                </div>
                <div class="stat-bar-container">
                  <div class="stat-bar" style="width:0%"></div>
                </div>
              </div>
            `;
          }).join("")}
        </div>
      </div>
    `;
  }

  // --- Community & Demographic Composition ---
  const ethnicity = data.ethnicityBreakdown;
  
  if (ethnicity) {
    const communitySection = `
      <div class="stats-section" style="margin-top: 24px;">
        <div class="modal-subsection" style="margin-bottom: 16px; padding: 12px; border-radius: 8px; border: 1px solid #d1d5db; background: #f3f7ff;">
          <h4 style="font-size: 18px; font-weight: 500; margin-bottom: 8px;">Ethnicity Breakdown</h4>
          <ul class="stat-list" style="margin-top: 8px; padding-left: 0; list-style: none; font-size: 14px;">
            <li style="margin-bottom: 4px;"><strong>White (Non-Hispanic):</strong> ${((ethnicity.white / ethnicity.total) * 100).toFixed(1)}%</li>
            <li style="margin-bottom: 4px;"><strong>Black or African American:</strong> ${((ethnicity.black / ethnicity.total) * 100).toFixed(1)}%</li>
            <li style="margin-bottom: 4px;"><strong>Native American:</strong> ${((ethnicity.native / ethnicity.total) * 100).toFixed(1)}%</li>
            <li style="margin-bottom: 4px;"><strong>Asian:</strong> ${((ethnicity.asian / ethnicity.total) * 100).toFixed(1)}%</li>
            <li style="margin-bottom: 4px;"><strong>Pacific Islander:</strong> ${((ethnicity.pacificIslander / ethnicity.total) * 100).toFixed(1)}%</li>
            <li style="margin-bottom: 4px;"><strong>Hispanic / Latino (Any Race):</strong> ${((ethnicity.hispanic / ethnicity.total) * 100).toFixed(1)}%</li>
          </ul>
        </div>
      </div>
    `;
    html += communitySection;
  }

  // Household Structure Insights
  if (data.householdInsights) {
    html += `
      <div class="stats-section">
        <h3>Household Structure Insights</h3>

        <div class="stat-row">
          <span class="stat-label">% Single-Person Households</span>
          <span class="stat-value">${data.householdInsights.pctSingle?.toFixed(1) ?? "–"}%</span>
        </div>

        <div class="stat-row">
          <span class="stat-label">% Non-Family Households</span>
          <span class="stat-value">${data.householdInsights.pctNonFamily?.toFixed(1) ?? "–"}%</span>
        </div>

        <div class="stat-row">
          <span class="stat-label">Average Household Size</span>
          <span class="stat-value">${data.householdInsights.avgHouseholdSize ?? "–"}</span>
        </div>

        <div class="stat-row">
          <span class="stat-label">% Housing in Large Multi-Unit Buildings</span>
          <span class="stat-value">${data.householdInsights.pctMultiUnitHousing?.toFixed(1) ?? "–"}%</span>
        </div>
      </div>`;
  }

  if (data.education) {
    html += `
      <div class="stats-section">
        <h3>Education</h3>
        ${data.education.highSchoolOrLess ? `
        <div class="stat-row">
          <span class="stat-label">High School or Less</span>
          <span class="stat-value">${formatPercent(data.education.highSchoolOrLess)}</span>
        </div>
        ` : ''}
        ${data.education.someCollege ? `
        <div class="stat-row">
          <span class="stat-label">Some College</span>
          <span class="stat-value">${formatPercent(data.education.someCollege)}</span>
        </div>
        ` : ''}
        ${data.education.bachelors ? `
        <div class="stat-row">
          <span class="stat-label">Bachelor's Degree</span>
          <span class="stat-value">${formatPercent(data.education.bachelors)}</span>
        </div>
        ` : ''}
        ${data.education.graduate ? `
        <div class="stat-row">
          <span class="stat-label">Graduate Degree</span>
          <span class="stat-value">${formatPercent(data.education.graduate)}</span>
        </div>
        ` : ''}
      </div>
    `;
  }

  if (data.source) {
    html += `<div class="source-note">${data.source}</div>`;
  }

  return html;
}

/** ---------- Animate Bars & Sparkline ---------- **/
function animateStatBars() {
  modalBody.selectAll(".income-bracket").each(function () {
    const container = d3.select(this);
    const bar = container.select(".stat-bar");
    const valueEl = container.select(".bar-value");
    const target = +valueEl.attr("data-target");

    bar.transition()
      .duration(600)
      .ease(d3.easeCubicOut)
      .styleTween("width", () => d3.interpolate("0%", `${target}%`));

    d3.transition().duration(600).tween("text", () => {
      const i = d3.interpolateNumber(0, target);
      return t => valueEl.text(`${Math.round(i(t))}%`);
    });
  });
}

function animateSparkline(data) {
  const node = modalBody.select(".sparkline").node();
  if (!node) return;
  
  const svgS = d3.select(node);
  const w = node.clientWidth || 400;
  const h = 120; // Increased height for histogram
  svgS.attr("viewBox", `0 0 ${w} ${h}`).attr("height", h);

  const histogramDataStr = svgS.attr("data-histogram");
  if (!histogramDataStr) return;
  
  const histData = JSON.parse(histogramDataStr);
  const { allIncomes, countyIncome, stateMedian, countyPercentile } = histData;
  
  if (!allIncomes || allIncomes.length === 0 || !countyIncome) {
    return;
  }

  svgS.selectAll("*").remove();

  // Calculate income range
  const minIncome = Math.min(...allIncomes);
  const maxIncome = Math.max(...allIncomes);
  const incomeRange = maxIncome - minIncome;
  
  // Create bins for histogram (10 bins)
  const numBins = 10;
  const binWidth = incomeRange / numBins;
  const bins = Array(numBins).fill(0).map((_, i) => ({
    min: minIncome + i * binWidth,
    max: minIncome + (i + 1) * binWidth,
    count: 0
  }));
  
  // Count counties in each bin
  allIncomes.forEach(income => {
    const binIndex = Math.min(Math.floor((income - minIncome) / binWidth), numBins - 1);
    bins[binIndex].count++;
  });
  
  const maxCount = Math.max(...bins.map(b => b.count));
  
  // Scales
  const padding = { top: 20, right: 20, bottom: 30, left: 40 };
  const chartWidth = w - padding.left - padding.right;
  const chartHeight = h - padding.top - padding.bottom;
  
  const x = d3.scaleLinear()
    .domain([minIncome, maxIncome])
    .range([padding.left, w - padding.right]);
  
  const y = d3.scaleLinear()
    .domain([0, maxCount])
    .range([h - padding.bottom, padding.top]);
  
  // Draw histogram bars
  bins.forEach((bin, i) => {
    const barWidth = (chartWidth / numBins) * 0.8;
    const barHeight = chartHeight - y(bin.count);
    const barX = x(bin.min) + (chartWidth / numBins) * 0.1;
    
    svgS.append("rect")
      .attr("x", barX)
      .attr("y", y(bin.count))
      .attr("width", barWidth)
      .attr("height", 0)
      .attr("fill", "#e9ecef")
      .attr("stroke", "#adb5bd")
      .attr("stroke-width", 0.5)
      .transition()
      .delay(i * 20)
      .duration(400)
      .attr("height", barHeight);
  });
  
  // Draw state median line (if available)
  if (stateMedian) {
    const stateX = x(stateMedian);
    svgS.append("line")
      .attr("x1", stateX)
      .attr("x2", stateX)
      .attr("y1", padding.top)
      .attr("y2", h - padding.bottom)
      .attr("stroke", "#6c757d")
      .attr("stroke-width", 2)
      .attr("stroke-dasharray", "4,3")
      .attr("opacity", 0)
      .transition()
      .delay(numBins * 20 + 100)
      .duration(300)
      .attr("opacity", 0.7);
    
    // State median label
    svgS.append("text")
      .attr("x", stateX)
      .attr("y", padding.top - 5)
      .attr("text-anchor", "middle")
      .attr("font-size", "10px")
      .attr("fill", "#6c757d")
      .attr("opacity", 0)
      .text("State Median")
      .transition()
      .delay(numBins * 20 + 100)
      .duration(300)
      .attr("opacity", 0.8);
  }
  
  // Draw county marker (vertical line + point)
  const countyX = x(countyIncome);
  const isAbove = stateMedian ? countyIncome >= stateMedian : true;
  const markerColor = isAbove ? "#28a745" : "#dc3545";
  
  // Vertical line showing county position
  svgS.append("line")
    .attr("x1", countyX)
    .attr("x2", countyX)
    .attr("y1", padding.top)
    .attr("y2", h - padding.bottom)
    .attr("stroke", markerColor)
    .attr("stroke-width", 2)
    .attr("opacity", 0)
    .transition()
    .delay(numBins * 20 + 200)
    .duration(300)
    .attr("opacity", 0.8);
  
  // County marker point at top
  svgS.append("circle")
    .attr("cx", countyX)
    .attr("cy", padding.top)
    .attr("r", 0)
    .attr("fill", markerColor)
    .attr("stroke", "white")
    .attr("stroke-width", 2)
    .transition()
    .delay(numBins * 20 + 300)
    .duration(300)
    .attr("r", 5);
  
  // X-axis labels
  const xAxis = d3.axisBottom(x)
    .ticks(5)
    .tickFormat(d => `$${(d / 1000).toFixed(0)}k`);
  
  svgS.append("g")
    .attr("transform", `translate(0, ${h - padding.bottom})`)
    .attr("opacity", 0)
    .call(xAxis)
    .selectAll("text")
    .attr("font-size", "9px")
    .attr("fill", "#6c757d")
    .transition()
    .delay(numBins * 20 + 400)
    .duration(300)
    .attr("opacity", 1);
  
  svgS.selectAll(".domain, .tick line")
    .attr("stroke", "#dee2e6")
    .attr("opacity", 0)
    .transition()
    .delay(numBins * 20 + 400)
    .duration(300)
    .attr("opacity", 0.5);
}

/** ---------- Collapsibles ---------- **/
function initCollapsibles() {
  modalBody.selectAll(".collapsible-header").each(function () {
    const header = d3.select(this);
    const content = d3.select(this.nextElementSibling);
    const icon = header.select(".collapsible-icon");

    header.on("click", () => {
      const isExpanded = content.classed("expanded");
      if (isExpanded) {
        content.style.maxHeight = content.node().scrollHeight + "px";
        icon.classed("expanded", false);
        requestAnimationFrame(() => {
          content.classed("expanded", false);
          content.style.maxHeight = "0px";
        });
      } else {
        content.classed("expanded", true);
        icon.classed("expanded", true);
        content.style.maxHeight = content.node().scrollHeight + "px";
      }
    });
    
    // Start expanded if not already
    if (content.classed("expanded")) {
      content.style.maxHeight = content.node().scrollHeight + "px";
      icon.classed("expanded", true);
    }
  });
}

/** ---------- UI Hooks ---------- **/
function initUIHooks() {
  window.addEventListener("resize", () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    projection.translate([w / 2, h / 2]);
    svg.attr("width", w).attr("height", h);
    gStates.selectAll("path.state").attr("d", path);
    gBorders.selectAll("path.border").attr("d", path);
    gCounties.selectAll("path.county").attr("d", path);
  });
  
  initCountySearch();
}

/** ---------- County Search ---------- **/
function initCountySearch() {
  const searchInput = document.getElementById("county-search");
  const dropdown = document.getElementById("search-dropdown");
  let selectedIndex = -1;
  let searchResults = [];

  if (!searchInput || !dropdown) return;

  // Helper to get county display name
  function getCountyName(county) {
    const countyData = demographicsData[county.id];
    if (countyData?.name) {
      return countyData.name.split(',')[0];
    }
    return county.properties?.name || `County FIPS: ${county.id}`;
  }

  // Helper to get state name from county FIPS
  function getStateNameFromCounty(county) {
    const stateFIPS = county.id.toString().slice(0, 2);
    const state = allStates.find(s => s.id === stateFIPS);
    return state?.properties?.name || `State ${stateFIPS}`;
  }

  // Search function
  function searchCounties(query) {
    if (!query || query.trim().length === 0) {
      dropdown.classList.remove("active");
      searchResults = [];
      return;
    }

    const searchTerm = query.toLowerCase().trim();
    const results = [];

    // Search through all counties
    allCounties.forEach(county => {
      const countyName = getCountyName(county).toLowerCase();
      const fipsCode = county.id.toString();
      const stateName = getStateNameFromCounty(county).toLowerCase();

      // Match by name, FIPS, or state name
      if (
        countyName.includes(searchTerm) ||
        fipsCode.includes(searchTerm) ||
        stateName.includes(searchTerm)
      ) {
        results.push({
          county: county,
          name: getCountyName(county),
          fips: fipsCode,
          state: getStateNameFromCounty(county)
        });
      }
    });

    // Sort: exact matches first, then by name
    results.sort((a, b) => {
      const aExact = a.name.toLowerCase() === searchTerm || a.fips === searchTerm;
      const bExact = b.name.toLowerCase() === searchTerm || b.fips === searchTerm;
      if (aExact && !bExact) return -1;
      if (!aExact && bExact) return 1;
      return a.name.localeCompare(b.name);
    });

    // Limit to 10 results
    searchResults = results.slice(0, 10);
    renderDropdown();
  }

  // Render dropdown
  function renderDropdown() {
    if (searchResults.length === 0) {
      dropdown.classList.remove("active");
      return;
    }

    dropdown.innerHTML = searchResults.map((result, index) => `
      <div class="search-result ${index === selectedIndex ? 'selected' : ''}" data-index="${index}">
        <div class="search-result-name">${result.name}</div>
        <div class="search-result-fips">FIPS: ${result.fips}</div>
        <div class="search-result-state">${result.state}</div>
      </div>
    `).join('');

    dropdown.classList.add("active");

    // Add click handlers
    dropdown.querySelectorAll(".search-result").forEach((el, index) => {
      el.addEventListener("click", () => selectCounty(searchResults[index]));
    });
  }

  // Navigate to selected county
  function selectCounty(result) {
    const county = result.county;
    const stateFIPS = county.id.toString().slice(0, 2);
    const state = allStates.find(s => s.id === stateFIPS);

    if (!state) {
      console.warn("State not found for county:", county.id);
      return;
    }

    // Clear search
    searchInput.value = "";
    dropdown.classList.remove("active");
    searchResults = [];
    selectedIndex = -1;

    // Navigate to county
    // If not already at this state, zoom to it first
    if (!currentState || currentState.id !== state.id) {
      zoomToState(state);
      // Wait for counties to be revealed, then open modal
      setTimeout(() => {
        openCountyModal(county, state);
      }, 1000);
    } else {
      // Already at the state, just open the modal
      openCountyModal(county, state);
    }
  }

  // Input handler
  searchInput.addEventListener("input", (e) => {
    searchCounties(e.target.value);
  });

  // Keyboard navigation
  searchInput.addEventListener("keydown", (e) => {
    if (!dropdown.classList.contains("active") || searchResults.length === 0) {
      if (e.key === "Enter" && searchResults.length > 0) {
        selectCounty(searchResults[0]);
      }
      return;
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        selectedIndex = Math.min(selectedIndex + 1, searchResults.length - 1);
        renderDropdown();
        // Scroll selected item into view
        const selectedEl = dropdown.querySelector(`[data-index="${selectedIndex}"]`);
        if (selectedEl) selectedEl.scrollIntoView({ block: "nearest" });
        break;
      case "ArrowUp":
        e.preventDefault();
        selectedIndex = Math.max(selectedIndex - 1, -1);
        renderDropdown();
        if (selectedIndex >= 0) {
          const selectedEl = dropdown.querySelector(`[data-index="${selectedIndex}"]`);
          if (selectedEl) selectedEl.scrollIntoView({ block: "nearest" });
        }
        break;
      case "Enter":
        e.preventDefault();
        if (selectedIndex >= 0 && selectedIndex < searchResults.length) {
          selectCounty(searchResults[selectedIndex]);
        } else if (searchResults.length > 0) {
          selectCounty(searchResults[0]);
        }
        break;
      case "Escape":
        dropdown.classList.remove("active");
        searchInput.blur();
        break;
    }
  });

  // Close dropdown when clicking outside
  document.addEventListener("click", (e) => {
    if (!searchInput.contains(e.target) && !dropdown.contains(e.target)) {
      dropdown.classList.remove("active");
    }
  });
}

/** ---------- Expose App Hooks for Demo Tour ---------- **/
function exposeAppHooks() {
  window.app = {
    get states() { return allStates; },
    get counties() { return allCounties; },
    zoomToState,
    zoomOut,
    openCountyModalWithStats,
    openCountyModal,
    fetchCountyStats,
  };
}

/** ---------- Census API Fetching ---------- **/
async function fetchCensusData(stateCode, countyCode, fullFIPS) {
  const base = "https://api.census.gov/data/2022/acs/acs5";
  const apiKey = import.meta.env?.VITE_CENSUS_API_KEY || '';

  async function get(vars) {
    const url = `${base}?get=${vars.join(",")}&for=county:${countyCode}&in=state:${stateCode}&key=${apiKey}`;
    console.log("Census API Request:", url);

    const res = await fetch(url);
    if (!res.ok) {
      console.error(await res.text());
      throw new Error("Census API returned 400");
    }

    return (await res.json())[1];
  }

  // GROUPED REQUESTS
  const coreVars = [
    "NAME",
    "B01001_001E", // population
    "B01002_001E", // median age
    "B19013_001E"  // median income
  ];

  const ethnicityVars = [
    "B03002_001E", "B03002_002E", "B03002_003E", "B03002_004E",
    "B03002_005E", "B03002_006E", "B03002_007E", "B03002_008E",
    "B03002_009E", "B03002_010E", "B03002_011E", "B03002_012E"
  ];

  // Age breakdown variables (B01001): All male and female age groups
  // B01001_003E to B01001_025E = Male age groups
  // B01001_027E to B01001_049E = Female age groups
  const ageVars = [
    "B01001_001E", // Total (already in core, but needed for age parsing)
    "B01001_003E", "B01001_004E", "B01001_005E", "B01001_006E", "B01001_007E", // Male: Under 5, 5-9, 10-14, 15-17, 18-19
    "B01001_008E", "B01001_009E", "B01001_010E", "B01001_011E", // Male: 20, 21, 22-24, 25-29
    "B01001_012E", "B01001_013E", "B01001_014E", "B01001_015E", // Male: 30-34, 35-39, 40-44, 45-49
    "B01001_016E", "B01001_017E", "B01001_018E", "B01001_019E", // Male: 50-54, 55-59, 60-61, 62-64
    "B01001_020E", "B01001_021E", "B01001_022E", "B01001_023E", "B01001_024E", // Male: 65-66, 67-69, 70-74, 75-79, 80-84
    "B01001_025E", // Male: 85+
    "B01001_027E", "B01001_028E", "B01001_029E", "B01001_030E", "B01001_031E", // Female: Under 5, 5-9, 10-14, 15-17, 18-19
    "B01001_032E", "B01001_033E", "B01001_034E", "B01001_035E", // Female: 20, 21, 22-24, 25-29
    "B01001_036E", "B01001_037E", "B01001_038E", "B01001_039E", // Female: 30-34, 35-39, 40-44, 45-49
    "B01001_040E", "B01001_041E", "B01001_042E", "B01001_043E", // Female: 50-54, 55-59, 60-61, 62-64
    "B01001_044E", "B01001_045E", "B01001_046E", "B01001_047E", "B01001_048E", // Female: 65-66, 67-69, 70-74, 75-79, 80-84
    "B01001_049E" // Female: 85+
  ];

  // Household composition & housing type
  const householdVars = [
    "B11001_001E", // Total households
    "B11001_007E", // Non-family households
    "B11001_008E", // Single-person households
    "B25010_001E", // Average household size
    "B25024_001E", // Total housing units (by structure)
    "B25024_005E", // 10-19 unit structures
    "B25024_006E", // 20-49 unit structures
    "B25024_007E", // 50+ unit structures
  ];

  try {
    const [core, ethnicity, ageData, household] = await Promise.all([
      get(coreVars),
      get(ethnicityVars),
      get(ageVars),
      get(householdVars)
    ]);

    // Calculate gender percentages from core data if available
    const population = +core[1] || 0;
    
    // Parse age data into expected format
    // ageData array indices correspond to ageVars array
    // Combine male and female values for each age range
    const parseAgeData = () => {
      if (!ageData || ageData.length < 48) return null;
      
      // Map array indices to age ranges by combining male and female
      // ageData[0] = B01001_001E (total), skip it
      // Male indices: 1-23 (B01001_003E to B01001_025E)
      // Female indices: 24-47 (B01001_027E to B01001_049E)
      
      return {
        "Under 5 years": (+ageData[1] || 0) + (+ageData[24] || 0), // Male + Female
        "5 to 9 years": (+ageData[2] || 0) + (+ageData[25] || 0),
        "10 to 14 years": (+ageData[3] || 0) + (+ageData[26] || 0),
        "15 to 17 years": (+ageData[4] || 0) + (+ageData[27] || 0),
        "18 and 19 years": (+ageData[5] || 0) + (+ageData[28] || 0),
        "20 years": (+ageData[6] || 0) + (+ageData[29] || 0),
        "21 years": (+ageData[7] || 0) + (+ageData[30] || 0),
        "22 to 24 years": (+ageData[8] || 0) + (+ageData[31] || 0),
        "25 to 29 years": (+ageData[9] || 0) + (+ageData[32] || 0),
        "30 to 34 years": (+ageData[10] || 0) + (+ageData[33] || 0),
        "35 to 39 years": (+ageData[11] || 0) + (+ageData[34] || 0),
        "40 to 44 years": (+ageData[12] || 0) + (+ageData[35] || 0),
        "45 to 49 years": (+ageData[13] || 0) + (+ageData[36] || 0),
        "50 to 54 years": (+ageData[14] || 0) + (+ageData[37] || 0),
        "55 to 59 years": (+ageData[15] || 0) + (+ageData[38] || 0),
        "60 and 61 years": (+ageData[16] || 0) + (+ageData[39] || 0),
        "62 to 64 years": (+ageData[17] || 0) + (+ageData[40] || 0),
        "65 and 66 years": (+ageData[18] || 0) + (+ageData[41] || 0),
        "67 to 69 years": (+ageData[19] || 0) + (+ageData[42] || 0),
        "70 to 74 years": (+ageData[20] || 0) + (+ageData[43] || 0),
        "75 to 79 years": (+ageData[21] || 0) + (+ageData[44] || 0),
        "80 to 84 years": (+ageData[22] || 0) + (+ageData[45] || 0),
        "85 years and over": (+ageData[23] || 0) + (+ageData[46] || 0)
      };
    };
    
    const ageBreakdown = parseAgeData();
    console.log("📊 Parsed age breakdown:", ageBreakdown);
    
    return {
      name: core[0] || `County FIPS: ${fullFIPS}`,
      fips: fullFIPS,
      population: population,
      medianAge: +core[2] || null,
      medianIncome: +core[3] || null,
      income: +core[3] ? { medianHousehold: +core[3] } : null,
      age: ageBreakdown,
      
      ethnicityBreakdown: {
        total: +ethnicity[0],
        white: +ethnicity[1],
        black: +ethnicity[2],
        native: +ethnicity[4],
        asian: +ethnicity[6],
        pacificIslander: +ethnicity[7],
        hispanic: +ethnicity[11]
      },


      householdComposition: {
        totalHouseholds: +household[0],
        nonFamilyHouseholds: +household[1],
        singlePersonHouseholds: +household[2],
        averageHouseholdSize: +household[3],
        totalHousingUnits: +household[4],
        structures10to19Units: +household[5],
        structures20to49Units: +household[6],
        structures50PlusUnits: +household[7]
      },

      householdInsights: (() => {
        const totalHouseholds = +household[0] || 0;
        const nonFamilyHouseholds = +household[1] || 0;
        const singleHouseholds = +household[2] || 0;
        const avgHouseholdSize = +household[3] || null;
        const totalHousingUnits = +household[4] || 0;
        const midRiseUnits = (+household[5] || 0) + (+household[6] || 0) + (+household[7] || 0);

        return {
          pctSingle: totalHouseholds ? (singleHouseholds / totalHouseholds * 100) : null,
          pctNonFamily: totalHouseholds ? (nonFamilyHouseholds / totalHouseholds * 100) : null,
          avgHouseholdSize,
          pctMultiUnitHousing: totalHousingUnits ? (midRiseUnits / totalHousingUnits * 100) : null,
        };
      })(),
      
      source: 'U.S. Census Bureau ACS 2022 (5-year estimates)'
    };
  } catch (error) {
    console.error('Census API error:', error);
    return null;
  }
}

/** ---------- Demo Tour ---------- **/
const demoBtn = document.getElementById("demo-btn");
const demoSkip = document.getElementById("demo-skip");

let demoRunning = false;
let cancelDemo = () => {};

const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const D = (ms) => prefersReducedMotion ? Math.min(200, ms) : ms;
const sleep = (ms) => new Promise(r => setTimeout(r, D(ms)));

// Helper to wait for a transition to complete
function awaitTransition(selection) {
  return new Promise((resolve) => {
    const n = selection.size();
    if (n === 0) {
      resolve();
      return;
    }
    let count = 0;
    selection.each(function() {
      const el = d3.select(this);
      const onEnd = () => {
        count++;
        if (count >= n) resolve();
      };
      el.transition().on("end", onEnd);
    });
    // Fallback timeout
    setTimeout(resolve, 2000);
  });
}

function onAnyUserInteractionCancel() {
  const abort = () => stopDemo("User interaction");
  window.addEventListener("wheel", abort, {once: true, passive: true});
  window.addEventListener("mousedown", abort, {once: true});
  window.addEventListener("keydown", (e) => { 
    if (e.key === "Escape") abort(); 
  }, {once: true});
  cancelDemo = abort;
}

function offAnyUserInteractionCancel() {
  cancelDemo = () => {};
}

async function runDemo() {
  if (demoRunning) return;
  demoRunning = true;
  demoBtn.disabled = true;
  demoSkip.hidden = false;
  onAnyUserInteractionCancel();

  try {
    const app = window.app;
    if (!app) {
      throw new Error("App hooks not initialized");
    }

    // 0) Start clean
    if (app.zoomOut) app.zoomOut();
    await sleep(700);
    if (!demoRunning) return;

    // 1) Focus California (FIPS state id "06")
    const ca = app.states?.find(s => s.id === "06") || 
              app.states?.find(s => s.properties?.name === "California");
    if (!ca) {
      // Fallback to first state if California not found
      const firstState = app.states?.[0];
      if (firstState) {
        if (app.zoomToState) app.zoomToState(firstState);
        await sleep(1100);
        if (!demoRunning) return;
        
        // Get first county in that state
        const stateId = firstState.id;
        const firstCounty = app.counties?.find(c => c.id && c.id.toString().startsWith(stateId));
        if (firstCounty && app.openCountyModal) {
          app.openCountyModal(firstCounty, firstState);
          await sleep(900);
        }
        if (app.zoomOut) app.zoomOut();
        await sleep(700);
      }
      throw new Error("State not found");
    }

    if (app.zoomToState) app.zoomToState(ca);
    await sleep(1100); // wait for zoom and county cascade
    if (!demoRunning) return;

    // 2) Open Los Angeles County (06037) if present; otherwise first county in CA
    const la = app.counties?.find(c => c.id === "06037") || 
               app.counties?.find(c => c.id && c.id.toString().startsWith("06"));
    if (la) {
      // Try ACS-backed modal first; fall back to placeholder modal
      try {
        const stateFIPS = "06";
        const countyFIPS = la.id.toString().slice(2, 5);
        if (app.fetchCountyStats) {
          const stats = await app.fetchCountyStats({ stateFIPS, countyFIPS });
          if (stats && app.openCountyModalWithStats) {
            app.openCountyModalWithStats(la, ca, stats);
          } else if (app.openCountyModal) {
            app.openCountyModal(la, ca);
          }
        } else if (app.openCountyModal) {
          app.openCountyModal(la, ca);
        }
      } catch (e) {
        console.warn("ACS fetch in tour failed, using fallback:", e);
        if (app.openCountyModal) app.openCountyModal(la, ca);
      }
    }
    await sleep(900);
    if (!demoRunning) return;

    // 3) Toggle the Income Distribution collapsible once
    const incomeHeader = document.querySelector(".collapsible-header");
    if (incomeHeader) { 
      incomeHeader.click(); 
      await sleep(450); 
      if (!demoRunning) return;
      incomeHeader.click(); 
    }

    // 4) Nudge pan to show minimap viewport movement
    const svgNode = svg.node();
    if (svgNode) {
      const currentTransform = d3.zoomTransform(svgNode);
      const nudge = d3.zoomIdentity.translate(currentTransform.x - 40, currentTransform.y).scale(currentTransform.k);
      svg.transition()
        .duration(D(500))
        .call(zoom.transform, nudge);
      await sleep(600);
      if (!demoRunning) return;
    }

    // 5) Close modal and zoom out
    const closeBtn = document.getElementById("modal-close");
    if (closeBtn) closeBtn.click();
    await sleep(300);
    if (!demoRunning) return;
    
    if (app.zoomOut) app.zoomOut();
    await sleep(700);

    demoBtn.textContent = "↺ Re-run";
  } catch (e) {
    console.warn("Demo tour error:", e);
    toast("Tour error: " + (e.message || "Unknown error"), 3000);
  } finally {
    stopDemo();
  }
}

function stopDemo(reason) {
  offAnyUserInteractionCancel();
  demoRunning = false;
  if (demoBtn) {
    demoBtn.disabled = false;
    if (demoBtn.textContent === "↺ Re-run") {
      // Keep re-run label if tour completed
    } else {
      demoBtn.textContent = "▶ Demo";
    }
  }
  if (demoSkip) demoSkip.hidden = true;
  if (reason && reason !== "User interaction") {
    console.log("Demo stopped:", reason);
  }
}

// Initialize demo button handlers (after DOM is ready)
if (typeof document !== 'undefined') {
  if (demoBtn) {
    demoBtn.addEventListener("click", runDemo);
  }
  if (demoSkip) {
    demoSkip.addEventListener("click", () => stopDemo("Skipped"));
  }
}
