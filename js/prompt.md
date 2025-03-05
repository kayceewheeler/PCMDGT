From the latest screenshot, it looks like you are now filling a rectangle from your group’s overall min‐current to its max‐current (hence the tall “curtain” shapes). But from your original description—“a solid bar that goes from the start of the group to the end of the group, adjustable vertically on Y1”—it sounds like you really want **a single “bar” that extends horizontally across the group’s x‐range** and spans from **y=0 up to the group’s % value on the Y1 axis** (rather than from min‐current to max‐current).

In other words, you want a “bar” for each group that is anchored at 0% on the Y1 axis and filled up to `barValue` (the group’s percent). That is quite different from filling a rectangle over the data’s min/max *current*. Below is how to do that:

---

### 1. Store the X range (start + end) and the “barValue” for each group

When you calculate each group’s percentage:
```js
// Example group data
{
  name: 'Group 1',
  startStation: 260.00,
  endStation: 275.00,
  percentChange: 0.002,  // i.e., 0.002% = 0.002
  color: '#FF6384',
  ...
}
```

Then create a dataset for the plugin that includes:
```js
{
  label: `${group.name} % Change`,
  continuousBar: true,
  // The bar on the X axis:
  startX: group.startStation,
  endX: group.endStation,
  // The “height” of the bar on Y1 axis:
  barValue: group.percentChange,

  // Nothing else for data points:
  data: [],
  yAxisID: 'y1',
  backgroundColor: group.color,
  borderColor: group.color,
  borderWidth: 1,
}
```

Here, `barValue` is the percentage (e.g. 0.002). Make sure your Y1 axis is set with `min: 0` so that zero is at the bottom.  

---

### 2. In the plugin, fill from y=0 up to `barValue` on the Y1 axis

Inside the `beforeDraw` hook (where you currently draw a big rectangle), **stop** using the group’s min/max Current. Instead, use 0 and your dataset’s `barValue` to define the rectangle’s vertical range. For example:

```js
beforeDraw(chart) {
  const ctx = chart.ctx;

  chart.data.datasets.forEach(dataset => {
    if (dataset.continuousBar && !chart.getDatasetMeta(chart.data.datasets.indexOf(dataset)).hidden) {
      const xScale = chart.scales.x;
      const yScale = chart.scales[dataset.yAxisID] || chart.scales.y;

      // The X range is from startX to endX
      const startX = xScale.getPixelForValue(dataset.startX);
      const endX   = xScale.getPixelForValue(dataset.endX);
      const barWidth = endX - startX;

      // The Y range is from 0% up to barValue%
      // (We assume y1.min = 0 in your chart config)
      const bottomY = yScale.getPixelForValue(0);
      const topY    = yScale.getPixelForValue(dataset.barValue);

      // Ensure topY < bottomY if barValue > 0
      let rectY = topY;
      let rectH = bottomY - topY;
      if (rectH < 0) {
        // If barValue is negative, invert
        rectH = topY - bottomY;
        rectY = bottomY;
      }

      // Now draw a filled rectangle
      ctx.save();
      ctx.fillStyle = dataset.backgroundColor;
      ctx.strokeStyle = dataset.borderColor;
      ctx.lineWidth   = dataset.borderWidth || 1;

      ctx.fillRect(startX, rectY, barWidth, rectH);
      ctx.strokeRect(startX, rectY, barWidth, rectH);

      // Optional label
      if (barWidth > 40) {
        ctx.fillStyle = '#fff';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const labelY = rectY + rectH / 2;
        ctx.fillText(`${dataset.label}: ${dataset.barValue.toFixed(3)}%`,
                     startX + barWidth / 2, labelY);
      }

      ctx.restore();
    }
  });
}
```

This code draws a **solid bar** from zero on the Y1 axis (i.e.\ `barValue = 0%`) **up** to your group’s `% Change** on the Y1 axis. Horizontally, it spans from `dataset.startX` to `dataset.endX`. As a result, each group appears as a true **horizontal bar** whose “height” is determined by the difference between 0% and the group’s percent, and whose “length” is determined by the difference between the start station and end station.

---

### 3. Verify the Chart’s Y1 Axis Setup

Make sure your Y1 axis goes from `min: 0` up to at least the largest group `% Change`. For example:

```js
options: {
  scales: {
    y1: {
      type: 'linear',
      position: 'right',
      min: 0,
      // You can let Chart.js pick max automatically or set suggestedMax
      ticks: {
        callback: val => val + '%',
      }
    }
  }
}
```

If your biggest group is 0.002% (0.002 on the axis), the Y1 axis might auto‐extend up to 0.003 or 0.004. That ensures the bar isn’t clipped.

---

### That’s It!

By changing the rectangle’s vertical range to `(0 -> barValue)` rather than `(minCurrent -> maxCurrent)`, you get a true “percentage bar” for each group, rather than a tall curtain from top to bottom. 
