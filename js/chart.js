// Main chart module — multi-line time series with brush, annotations, tooltips

const THEME_COLORS = {
    "World Events": "#ff6b6b",
    "Science & Technology": "#51cf66",
    "Entertainment": "#ffd43b",
    "People": "#74c0fc",
    "Disasters & Crises": "#f783ac",
};

// Per-topic color palette (within each theme, distribute shades)
const TOPIC_PALETTES = {
    "World Events": ["#ff6b6b","#e8534b","#ff8787","#c44040","#ff9e9e","#d95555","#ffb3b3","#b33030","#ffc9c9","#a02020"],
    "Science & Technology": ["#51cf66","#40c057","#69db7c","#2fb344","#8ce99a","#37b24d","#a9e34b","#2e9e3e","#b2f2bb","#268a35"],
    "Entertainment": ["#ffd43b","#fab005","#ffe066","#f59f00","#ffec99","#e67700","#fff3bf","#d96c00","#fff9db","#cc5de8"],
    "People": ["#74c0fc","#4dabf7","#a5d8ff","#339af0","#d0ebff","#228be6","#99d1ff","#1c7ed6","#bbd8f5","#1864ab"],
    "Disasters & Crises": ["#f783ac","#e64980","#faa2c1","#d6336c","#fcc2d7","#c2255c","#ffdae9","#a61e4d","#ffdeeb","#862e52"],
};

class AttentionChart {
    constructor(containerSelector, contextSelector) {
        this.container = d3.select(containerSelector);
        this.contextContainer = d3.select(contextSelector);
        this.activeTopics = [];
        this.topicColorMap = {};
        this.brushExtent = null;
        this.tooltipLocked = false;
        this.showAnnotations = true;
        this.onBrushChange = null;
        this.parseDate = d3.timeParse("%Y%m%d");
        this.formatDateStr = d3.timeFormat("%Y%m%d");

        this.margin = { top: 20, right: 30, bottom: 30, left: 65 };
        this.ctxMargin = { top: 2, right: 30, bottom: 50, left: 65 };

        this._initChart();
        this._initContext();
        this._initTooltip();

        window.addEventListener("resize", () => this._resize());
    }

    _getDims(containerNode, margins) {
        const rect = containerNode.getBoundingClientRect();
        return {
            totalW: rect.width,
            totalH: rect.height,
            w: Math.max(100, rect.width - margins.left - margins.right),
            h: Math.max(50, rect.height - margins.top - margins.bottom),
        };
    }

    _initChart() {
        const dims = this._getDims(this.container.node(), this.margin);
        this.width = dims.w;
        this.height = dims.h;

        this.svg = this.container.append("svg")
            .attr("width", dims.totalW)
            .attr("height", dims.totalH);

        this.g = this.svg.append("g")
            .attr("transform", `translate(${this.margin.left},${this.margin.top})`);

        this.svg.append("defs").append("clipPath")
            .attr("id", "chart-clip")
            .append("rect")
            .attr("width", this.width)
            .attr("height", this.height);

        this.xScale = d3.scaleTime().range([0, this.width]);
        this.yScale = d3.scaleLinear().range([this.height, 0]);

        this.g.append("g").attr("class", "grid grid-y");

        this.xAxisG = this.g.append("g")
            .attr("class", "axis x-axis")
            .attr("transform", `translate(0,${this.height})`);

        this.yAxisG = this.g.append("g")
            .attr("class", "axis y-axis");

        this.yLabel = this.g.append("text")
            .attr("class", "axis-label")
            .attr("transform", "rotate(-90)")
            .attr("x", -this.height / 2)
            .attr("y", -50)
            .attr("text-anchor", "middle")
            .attr("fill", "#8b8fa3")
            .attr("font-size", "0.75rem")
            .text("Daily pageviews");

        this.linesG = this.g.append("g")
            .attr("class", "lines-group")
            .attr("clip-path", "url(#chart-clip)");

        this.annotationsG = this.g.append("g")
            .attr("class", "annotations-group")
            .attr("clip-path", "url(#chart-clip)");

        this.crosshairG = this.g.append("g").attr("class", "crosshair").style("display", "none");
        this.crosshairG.append("line")
            .attr("class", "crosshair-line")
            .attr("y1", 0)
            .attr("y2", this.height);

        this.dotsG = this.g.append("g").attr("class", "hover-dots");

        this.overlay = this.g.append("rect")
            .attr("class", "overlay")
            .attr("width", this.width)
            .attr("height", this.height)
            .attr("fill", "none")
            .attr("pointer-events", "all")
            .style("cursor", "crosshair");

        this._setupMouseEvents();
    }

    _initContext() {
        const dims = this._getDims(this.contextContainer.node(), this.ctxMargin);
        this.ctxWidth = dims.w;
        this.ctxHeight = dims.h;

        this.ctxSvg = this.contextContainer.append("svg")
            .attr("width", dims.totalW)
            .attr("height", dims.totalH);

        this.ctxG = this.ctxSvg.append("g")
            .attr("transform", `translate(${this.ctxMargin.left},${this.ctxMargin.top})`);

        this.ctxXScale = d3.scaleTime().range([0, this.ctxWidth]);
        this.ctxYScale = d3.scaleLinear().range([this.ctxHeight, 0]);

        this.ctxXAxisG = this.ctxG.append("g")
            .attr("class", "axis x-axis")
            .attr("transform", `translate(0,${this.ctxHeight})`);

        this.ctxLinesG = this.ctxG.append("g").attr("class", "ctx-lines");

        this.brush = d3.brushX()
            .extent([[0, 0], [this.ctxWidth, this.ctxHeight]])
            .on("brush end", (event) => this._onBrush(event));

        this.brushG = this.ctxG.append("g")
            .attr("class", "brush")
            .call(this.brush);
    }

    _initTooltip() {
        this.tooltip = d3.select("#tooltip");
    }

    _setupMouseEvents() {
        const bisectDate = d3.bisector(d => d.date).left;
        const self = this;

        this.overlay
            .on("mousemove", function(event) {
                if (self.tooltipLocked) return;
                if (self.activeTopics.length === 0) return;

                const [mx] = d3.pointer(event, this);
                const xDate = self.xScale.invert(mx);

                self.crosshairG.style("display", null);
                self.crosshairG.select("line")
                    .attr("x1", mx).attr("x2", mx);

                self.dotsG.selectAll("*").remove();
                let tooltipData = [];

                self.activeTopics.forEach(topic => {
                    const parsed = topic._parsed;
                    if (!parsed || parsed.length === 0) return;
                    const i = bisectDate(parsed, xDate, 1);
                    const d0 = parsed[i - 1];
                    const d1 = parsed[i];
                    if (!d0 && !d1) return;
                    const d = !d0 ? d1 : !d1 ? d0 : (xDate - d0.date > d1.date - xDate ? d1 : d0);

                    const cx = self.xScale(d.date);
                    const cy = self.yScale(d.views);

                    if (cx >= 0 && cx <= self.width && !isNaN(cy)) {
                        self.dotsG.append("circle")
                            .attr("cx", cx).attr("cy", cy).attr("r", 4)
                            .attr("fill", self.topicColorMap[topic.article])
                            .attr("stroke", "#0f1117").attr("stroke-width", 1.5);
                        tooltipData.push({ topic, d });
                    }
                });

                if (tooltipData.length > 0) {
                    self._showTooltip(event, tooltipData);
                } else {
                    self._hideTooltip();
                }
            })
            .on("mouseleave", function() {
                if (self.tooltipLocked) return;
                self.crosshairG.style("display", "none");
                self.dotsG.selectAll("*").remove();
                self._hideTooltip();
            })
            .on("click", function(event) {
                if (self.tooltipLocked) {
                    self.tooltipLocked = false;
                    self.tooltip.classed("locked", false);
                    self._hideTooltip();
                    self.crosshairG.style("display", "none");
                    self.dotsG.selectAll("*").remove();
                } else {
                    self.tooltipLocked = true;
                    self.tooltip.classed("locked", true);
                }
            });
    }

    _showTooltip(event, data) {
        data.sort((a, b) => b.d.views - a.d.views);
        const firstDate = data[0].d;

        let html = `<div class="tooltip-date">${formatDate(firstDate.date)}</div>`;
        data.forEach(({ topic, d }) => {
            const color = this.topicColorMap[topic.article];
            const prev = this._getPrevDayViews(topic, d);
            const change = prev !== null ? d.views - prev : null;
            const changeStr = change !== null
                ? `<span style="color:${change >= 0 ? '#51cf66' : '#ff6b6b'}">${change >= 0 ? '+' : ''}${formatNumber(change)}</span>`
                : '';

            html += `
                <div style="margin-top:6px; border-left: 3px solid ${color}; padding-left: 8px;">
                    <div class="tooltip-title" style="color:${color}">${topic.name}</div>
                    <div class="tooltip-views">${formatNumber(d.views)} views</div>
                    ${changeStr ? `<div class="tooltip-change">vs prev day: ${changeStr}</div>` : ''}
                </div>`;
        });
        html += `<div class="tooltip-lock-hint">Click to ${this.tooltipLocked ? 'unlock' : 'lock'} tooltip</div>`;

        this.tooltip.html(html).classed("hidden", false);

        const tx = event.clientX + 16;
        const ty = event.clientY - 10;
        const tw = this.tooltip.node().offsetWidth;
        const th = this.tooltip.node().offsetHeight;
        const finalX = tx + tw > window.innerWidth ? event.clientX - tw - 16 : tx;
        const finalY = ty + th > window.innerHeight ? window.innerHeight - th - 8 : ty;

        this.tooltip.style("left", finalX + "px").style("top", finalY + "px");
    }

    _hideTooltip() {
        if (!this.tooltipLocked) {
            this.tooltip.classed("hidden", true);
        }
    }

    _getPrevDayViews(topic, d) {
        const parsed = topic._parsed;
        const idx = parsed.findIndex(p => p.date.getTime() === d.date.getTime());
        return idx > 0 ? parsed[idx - 1].views : null;
    }

    _onBrush(event) {
        if (!event.selection) {
            this.brushExtent = null;
        } else {
            this.brushExtent = event.selection.map(d => this.ctxXScale.invert(d));
        }
        this._updateMainDomain();
        this._renderMainChart();
        this._renderAnnotations();
        if (this.onBrushChange) {
            this.onBrushChange(this.brushExtent);
        }
    }

    _updateMainDomain() {
        if (this.activeTopics.length === 0) return;

        const extent = this.brushExtent || this.fullXExtent;
        if (!extent) return;
        this.xScale.domain(extent);

        let maxViews = 0;
        this.activeTopics.forEach(topic => {
            topic._parsed.forEach(d => {
                if (d.date >= extent[0] && d.date <= extent[1]) {
                    maxViews = Math.max(maxViews, d.views);
                }
            });
        });
        this.yScale.domain([0, maxViews * 1.08]).nice();
    }

    setTopicColor(article, color) {
        this.topicColorMap[article] = color;
    }

    getTopicColor(article) {
        return this.topicColorMap[article] || "#888";
    }

    addTopic(topicData) {
        if (!topicData._parsed) {
            topicData._parsed = topicData.timeseries
                .map(d => ({
                    date: this.parseDate(d.date),
                    views: d.views,
                }))
                .filter(d => d.date !== null);
            topicData._parsed.sort((a, b) => a.date - b.date);
        }

        if (this.activeTopics.find(t => t.article === topicData.article)) return;
        this.activeTopics.push(topicData);
        this._recomputeFullExtent();
        this._updateMainDomain();
        this.render();
    }

    removeTopic(article) {
        this.activeTopics = this.activeTopics.filter(t => t.article !== article);
        this._recomputeFullExtent();
        if (this.activeTopics.length > 0) {
            this._updateMainDomain();
        }
        this.render();
    }

    _recomputeFullExtent() {
        if (this.activeTopics.length === 0) {
            this.fullXExtent = null;
            return;
        }
        let minDate = null, maxDate = null;
        let maxViews = 0;
        this.activeTopics.forEach(topic => {
            const parsed = topic._parsed;
            if (parsed.length > 0) {
                const first = parsed[0].date;
                const last = parsed[parsed.length - 1].date;
                if (!minDate || first < minDate) minDate = first;
                if (!maxDate || last > maxDate) maxDate = last;
            }
            parsed.forEach(d => { if (d.views > maxViews) maxViews = d.views; });
        });
        this.fullXExtent = [minDate, maxDate];
        this.ctxXScale.domain([minDate, maxDate]);
        this.ctxYScale.domain([0, maxViews]);
    }

    resetBrush() {
        this.brushG.call(this.brush.move, null);
        this.brushExtent = null;
        this._updateMainDomain();
        this.render();
    }

    render() {
        this._renderMainChart();
        this._renderContextChart();
        this._renderAnnotations();
    }

    _renderMainChart() {
        if (this.activeTopics.length === 0) {
            this.linesG.selectAll(".line-path").remove();
            this.xAxisG.selectAll("*").remove();
            this.yAxisG.selectAll("*").remove();
            this.g.select(".grid-y").selectAll("*").remove();
            return;
        }

        const t = d3.transition().duration(500).ease(d3.easeCubicOut);

        this.xAxisG.transition(t).call(
            d3.axisBottom(this.xScale).ticks(this.width > 600 ? 10 : 5)
        );
        this.yAxisG.transition(t).call(
            d3.axisLeft(this.yScale)
                .ticks(6)
                .tickFormat(d => {
                    if (d >= 1e6) return (d / 1e6).toFixed(1) + "M";
                    if (d >= 1e3) return (d / 1e3).toFixed(0) + "K";
                    return d;
                })
        );

        this.g.select(".grid-y")
            .transition(t)
            .call(
                d3.axisLeft(this.yScale)
                    .ticks(6)
                    .tickSize(-this.width)
                    .tickFormat("")
            );

        const line = d3.line()
            .defined(d => !isNaN(d.views))
            .x(d => this.xScale(d.date))
            .y(d => this.yScale(d.views))
            .curve(d3.curveMonotoneX);

        const getDrawData = (topic) => {
            const extent = this.brushExtent || this.fullXExtent;
            if (!extent) return [];
            const filtered = topic._parsed.filter(d => d.date >= extent[0] && d.date <= extent[1]);
            if (filtered.length > 600) {
                const step = Math.ceil(filtered.length / 600);
                return filtered.filter((_, i) => i % step === 0);
            }
            return filtered;
        };

        const paths = this.linesG.selectAll(".line-path")
            .data(this.activeTopics, d => d.article);

        paths.enter()
            .append("path")
            .attr("class", "line-path")
            .attr("stroke", d => this.topicColorMap[d.article])
            .attr("d", d => line(getDrawData(d)))
            .attr("stroke-opacity", 0)
            .transition(t)
            .attr("stroke-opacity", 1);

        paths.transition(t)
            .attr("stroke", d => this.topicColorMap[d.article])
            .attr("d", d => line(getDrawData(d)))
            .attr("stroke-opacity", 1);

        paths.exit()
            .transition(t)
            .attr("stroke-opacity", 0)
            .remove();
    }

    _renderContextChart() {
        if (this.activeTopics.length === 0) {
            this.ctxLinesG.selectAll(".ctx-line-path").remove();
            this.ctxXAxisG.selectAll("*").remove();
            return;
        }

        const line = d3.line()
            .defined(d => !isNaN(d.views))
            .x(d => this.ctxXScale(d.date))
            .y(d => this.ctxYScale(d.views))
            .curve(d3.curveMonotoneX);

        const getCtxData = (topic) => {
            const parsed = topic._parsed;
            const step = Math.max(1, Math.ceil(parsed.length / 200));
            return parsed.filter((_, i) => i % step === 0);
        };

        this.ctxXAxisG.call(d3.axisBottom(this.ctxXScale).ticks(6));

        const paths = this.ctxLinesG.selectAll(".ctx-line-path")
            .data(this.activeTopics, d => d.article);

        paths.enter()
            .append("path")
            .attr("class", "ctx-line-path")
            .attr("fill", "none")
            .attr("stroke", d => this.topicColorMap[d.article])
            .attr("stroke-width", 1)
            .attr("stroke-opacity", 0.6)
            .attr("d", d => line(getCtxData(d)));

        paths.attr("stroke", d => this.topicColorMap[d.article])
            .attr("d", d => line(getCtxData(d)));

        paths.exit().remove();
    }

    _renderAnnotations() {
        if (!this.showAnnotations || this.activeTopics.length === 0) {
            this.annotationsG.selectAll("*").remove();
            return;
        }

        const activeArticles = new Set(this.activeTopics.map(t => t.article));
        const extent = this.brushExtent || this.fullXExtent;
        if (!extent) {
            this.annotationsG.selectAll("*").remove();
            return;
        }

        const visibleAnnotations = ANNOTATIONS.filter(a => {
            if (!activeArticles.has(a.article)) return false;
            const d = this.parseDate(a.date);
            return d && d >= extent[0] && d <= extent[1];
        });

        visibleAnnotations.forEach(a => {
            const topic = this.activeTopics.find(t => t.article === a.article);
            if (!topic) return;
            const d = this.parseDate(a.date);
            const bisect = d3.bisector(p => p.date).left;
            const i = bisect(topic._parsed, d, 1);
            const d0 = topic._parsed[i - 1];
            const d1 = topic._parsed[i];
            const nearest = !d0 ? d1 : !d1 ? d0 : (d - d0.date > d1.date - d ? d1 : d0);
            a._x = this.xScale(d);
            a._y = nearest ? this.yScale(nearest.views) : this.height / 2;
            a._views = nearest ? nearest.views : 0;
            a._color = this.topicColorMap[a.article];
        });

        const t = d3.transition().duration(300);
        const self = this;

        const markers = this.annotationsG.selectAll(".annotation-marker")
            .data(visibleAnnotations, d => d.date + d.article);

        const enter = markers.enter()
            .append("g")
            .attr("class", "annotation-marker")
            .attr("transform", d => `translate(${d._x},${d._y})`)
            .style("opacity", 0);

        enter.append("circle")
            .attr("r", 5)
            .attr("fill", d => d._color)
            .attr("stroke", "#0f1117")
            .attr("stroke-width", 2);

        enter.append("line")
            .attr("class", "annotation-line")
            .attr("x1", 0).attr("y1", -8)
            .attr("x2", 0).attr("y2", -30);

        enter.append("text")
            .attr("class", "annotation-label")
            .attr("x", 0).attr("y", -34)
            .attr("text-anchor", "middle")
            .text(d => d.title);

        enter.on("mouseenter", function(event, d) {
            if (self.tooltipLocked) return;
            const html = `
                <div class="tooltip-title" style="color:${d._color}">${d.title}</div>
                <div class="tooltip-date">${formatDate(self.parseDate(d.date))}</div>
                <div style="margin-top:6px;font-size:0.82rem;color:#e4e6f0;">${d.text}</div>
                <div style="margin-top:4px;font-size:0.8rem;font-weight:700;">${formatNumber(d._views)} views</div>
            `;
            self.tooltip.html(html).classed("hidden", false);
            self.tooltip.style("left", (event.clientX + 16) + "px").style("top", (event.clientY - 10) + "px");
        })
        .on("mouseleave", function() {
            if (!self.tooltipLocked) self.tooltip.classed("hidden", true);
        });

        enter.transition(t).style("opacity", 1);

        markers.transition(t)
            .attr("transform", d => `translate(${d._x},${d._y})`)
            .style("opacity", 1);
        markers.select("circle").attr("fill", d => d._color);
        markers.select("text").text(d => d.title);

        markers.exit().transition(t).style("opacity", 0).remove();
    }

    setShowAnnotations(show) {
        this.showAnnotations = show;
        this._renderAnnotations();
    }

    navigateToDate(date, windowDays = 30) {
        if (!this.fullXExtent) return;
        const start = d3.timeDay.offset(date, -windowDays);
        const end = d3.timeDay.offset(date, windowDays);

        const clamped = [
            d3.max([start, this.fullXExtent[0]]),
            d3.min([end, this.fullXExtent[1]]),
        ];

        const brushPixels = [
            this.ctxXScale(clamped[0]),
            this.ctxXScale(clamped[1]),
        ];
        this.brushG.transition().duration(600).call(this.brush.move, brushPixels);
    }

    _resize() {
        const dims = this._getDims(this.container.node(), this.margin);
        this.width = dims.w;
        this.height = dims.h;

        this.svg.attr("width", dims.totalW).attr("height", dims.totalH);
        this.svg.select("#chart-clip rect").attr("width", this.width).attr("height", this.height);
        this.xScale.range([0, this.width]);
        this.yScale.range([this.height, 0]);
        this.xAxisG.attr("transform", `translate(0,${this.height})`);
        this.overlay.attr("width", this.width).attr("height", this.height);
        this.crosshairG.select("line").attr("y2", this.height);
        this.yLabel.attr("x", -this.height / 2);

        const ctxDims = this._getDims(this.contextContainer.node(), this.ctxMargin);
        this.ctxWidth = ctxDims.w;
        this.ctxHeight = ctxDims.h;
        this.ctxSvg.attr("width", ctxDims.totalW).attr("height", ctxDims.totalH);
        this.ctxXScale.range([0, this.ctxWidth]);
        this.ctxYScale.range([this.ctxHeight, 0]);
        this.ctxXAxisG.attr("transform", `translate(0,${this.ctxHeight})`);
        this.brush.extent([[0, 0], [this.ctxWidth, this.ctxHeight]]);
        this.brushG.call(this.brush);

        if (this.activeTopics.length > 0) {
            this._updateMainDomain();
        }
        this.render();
    }

    highlightTopic(article) {
        this.linesG.selectAll(".line-path")
            .classed("faded", d => d.article !== article);
    }

    unhighlightAll() {
        this.linesG.selectAll(".line-path")
            .classed("faded", false);
    }
}
