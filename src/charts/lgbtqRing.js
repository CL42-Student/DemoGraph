import * as d3 from "d3";

export function drawLGBTQRing(lgbtqIndex) {
  const container = d3.select("#lgbtq-ring");
  container.selectAll("*").remove();

  const width = 200;
  const height = 200;
  const radius = Math.min(width, height) / 2 - 10;
  const svg = container.append("svg")
    .attr("width", width)
    .attr("height", height);

  const g = svg.append("g")
    .attr("transform", `translate(${width / 2}, ${height / 2})`);

  // Determine color based on signal strength
  let color;
  if (lgbtqIndex < 2) {
    color = "#b0bec5"; // Low
  } else if (lgbtqIndex < 5) {
    color = "#4a90e2"; // Medium
  } else {
    color = "#ff6f61"; // High
  }

  // Create arc generator
  const arc = d3.arc()
    .innerRadius(radius - 20)
    .outerRadius(radius)
    .startAngle(0)
    .cornerRadius(4);

  // Background arc (full circle)
  g.append("path")
    .datum({ endAngle: 2 * Math.PI })
    .attr("fill", "#e0e0e0")
    .attr("d", arc);

  // Animated arc
  const path = g.append("path")
    .datum({ endAngle: 0 })
    .attr("fill", color)
    .attr("d", arc);

  // Animate with elastic easing
  path.transition()
    .duration(1500)
    .ease(d3.easeElasticOut.period(0.6))
    .attrTween("d", function(d) {
      const interpolate = d3.interpolate(d.endAngle, (lgbtqIndex / 100) * 2 * Math.PI);
      return function(t) {
        d.endAngle = interpolate(t);
        return arc(d);
      };
    });

  // Add percentage label
  const label = g.append("text")
    .attr("text-anchor", "middle")
    .attr("dy", "0.35em")
    .attr("font-size", "24px")
    .attr("font-weight", "600")
    .attr("fill", "#333")
    .text("0%");

  label.transition()
    .duration(1500)
    .ease(d3.easeElasticOut.period(0.6))
    .tween("text", function() {
      const interpolate = d3.interpolateNumber(0, lgbtqIndex);
      return function(t) {
        d3.select(this).text(interpolate(t).toFixed(1) + "%");
      };
    });
}

