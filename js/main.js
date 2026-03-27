// Main application entry point

(function () {
    let allTopics = [];
    let chart = null;
    let tour = null;
    let topicColorAssignments = {};
    let viewMode = "raw";
    let spikeMode = "absolute";

    const MAX_ACTIVE_TOPICS = 5;

    const THEME_STORAGE_KEY = "wikiAttentionTheme";
    const prefersLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
    const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
    const initialTheme = savedTheme || (prefersLight ? 'light' : 'dark');
    setTheme(initialTheme, false);

    // Load data and initialize
    d3.json("data/pageviews.json").then(data => {
        // Expand compact format to full format
        const parseDate = d3.timeParse("%Y%m%d");
        allTopics = data.topics.map(t => {
            const startDate = parseDate(t.s);
            const timeseries = t.v.map((views, i) => {
                const d = d3.timeDay.offset(startDate, i);
                return { date: d3.timeFormat("%Y%m%d")(d), views: views };
            });
            return {
                article: t.a,
                name: t.n,
                theme: t.t,
                timeseries: timeseries,
            };
        });
        // Defer init to ensure DOM layout is computed
        requestAnimationFrame(() => init());
    }).catch(err => {
        console.error("Failed to load data:", err);
        d3.select("#main-chart").append("div")
            .style("padding", "40px")
            .style("color", "var(--danger)")
            .text("Failed to load pageview data. Make sure data/pageviews.json exists.");
    });

    function init() {
        // Assign colors to topics
        assignColors();

        // Initialize chart
        chart = new AttentionChart("#main-chart", "#context-chart");
        chart.onBrushChange = (extent) => {
            updateSpikePanel();
            updateInsightPanel();
        };
        chart.setViewMode(viewMode);

        // Theme toggle button
        const toggleBtn = d3.select('#theme-toggle');
        toggleBtn.on('click', () => {
            const next = document.body.dataset.theme === 'light' ? 'dark' : 'light';
            setTheme(next, true);
        });
        toggleBtn.classed('is-light', document.body.dataset.theme === 'light');

        // Build sidebar
        buildSidebar();

        // Initialize tour
        tour = new GuidedTour(chart, ensureTopicActive);

        // Wire up controls
        d3.select("#tour-btn").on("click", () => tour.start());
        d3.select("#reset-btn").on("click", () => {
            chart.resetBrush();
            updateSpikePanel();
            updateInsightPanel();
        });
        d3.select("#show-annotations").on("change", function () {
            chart.setShowAnnotations(this.checked);
        });
        d3.select("#topic-search").on("input", function () {
            filterSidebar(this.value.toLowerCase().trim());
        });
        d3.selectAll("#view-mode-toggle .segmented-btn").on("click", function () {
            viewMode = d3.select(this).attr("data-view-mode");
            d3.selectAll("#view-mode-toggle .segmented-btn").classed("active", false);
            d3.select(this).classed("active", true);
            chart.setViewMode(viewMode);
            updateSpikePanel();
            updateInsightPanel();
        });
        d3.selectAll("#spike-mode-toggle .segmented-btn").on("click", function () {
            spikeMode = d3.select(this).attr("data-spike-mode");
            d3.selectAll("#spike-mode-toggle .segmented-btn").classed("active", false);
            d3.select(this).classed("active", true);
            updateSpikeDescription();
            updateSpikePanel();
        });
        updateSpikeDescription();
        updateInsightPanel();

        // Start with a few interesting default topics
        const defaults = [
            "COVID-19_pandemic",
            "ChatGPT",
        ];
        defaults.forEach(article => ensureTopicActive(article));
    }

    function assignColors() {
        // Group topics by theme
        const byTheme = {};
        allTopics.forEach(t => {
            if (!byTheme[t.theme]) byTheme[t.theme] = [];
            byTheme[t.theme].push(t);
        });

        Object.entries(byTheme).forEach(([theme, topics]) => {
            const palette = TOPIC_PALETTES[theme] || ["#888"];
            topics.forEach((t, i) => {
                topicColorAssignments[t.article] = palette[i % palette.length];
            });
        });
    }

    function getThemeAccent(theme) {
        const themeVarMap = {
            "World Events": "--theme-events",
            "Science & Technology": "--theme-science",
            "Entertainment": "--theme-entertainment",
            "People": "--theme-people",
            "Disasters & Crises": "--theme-disasters",
        };
        const variableName = themeVarMap[theme];
        if (!variableName) return THEME_COLORS[theme] || "#888";
        return getComputedStyle(document.body).getPropertyValue(variableName).trim() || THEME_COLORS[theme] || "#888";
    }

    function refreshThemeAccents() {
        d3.selectAll(".theme-group").each(function () {
            const group = d3.select(this);
            const theme = group.attr("data-theme-name");
            group.select(".theme-dot").style("background", getThemeAccent(theme));
        });
        if (chart) {
            chart.render();
        }
    }

    function buildSidebar() {
        const themeList = d3.select("#theme-list");

        // Group topics by theme
        const byTheme = {};
        allTopics.forEach(t => {
            if (!byTheme[t.theme]) byTheme[t.theme] = [];
            byTheme[t.theme].push(t);
        });

        Object.entries(byTheme).forEach(([theme, topics]) => {
            const group = themeList.append("div").attr("class", "theme-group").attr("data-theme-name", theme);

            const header = group.append("div")
                .attr("class", "theme-group-header")
                .on("click", function () {
                    group.classed("collapsed", !group.classed("collapsed"));
                });

            header.append("span")
                .attr("class", "theme-dot")
                .style("background", getThemeAccent(theme));

            header.append("span").text(theme);
            header.append("span").attr("class", "theme-arrow").html("&#9660;");

            const items = group.append("div").attr("class", "theme-items");

            topics.forEach(topic => {
                const item = items.append("div")
                    .attr("class", "topic-item")
                    .attr("data-article", topic.article)
                    .attr("data-name", topic.name.toLowerCase())
                    .on("click", () => toggleTopic(topic.article))
                    .on("mouseenter", () => {
                        if (chart && isTopicActive(topic.article)) {
                            chart.highlightTopic(topic.article);
                        }
                    })
                    .on("mouseleave", () => {
                        if (chart) chart.unhighlightAll();
                    });

                item.append("span")
                    .attr("class", "topic-color-swatch")
                    .style("background", topicColorAssignments[topic.article]);

                item.append("span").text(topic.name);
            });
        });
    }

    function filterSidebar(query) {
        d3.selectAll(".topic-item").each(function () {
            const el = d3.select(this);
            const name = el.attr("data-name");
            el.classed("hidden-by-search", query && !name.includes(query));
        });

        d3.selectAll(".theme-group").each(function () {
            const group = d3.select(this);
            const visibleCount = group.selectAll(".topic-item:not(.hidden-by-search)").size();
            group.classed("hidden-by-search", query && visibleCount === 0);
        });

        // Expand all groups when searching
        if (query) {
            d3.selectAll(".theme-group").classed("collapsed", false);
        }
    }

    function isTopicActive(article) {
        return chart && chart.activeTopics.some(t => t.article === article);
    }

    function toggleTopic(article) {
        if (isTopicActive(article)) {
            deactivateTopic(article);
        } else {
            ensureTopicActive(article);
        }
    }

    function ensureTopicActive(article) {
        if (isTopicActive(article)) return;
        if (chart.activeTopics.length >= MAX_ACTIVE_TOPICS) {
            flashActiveHint(`Comparison works best with a small set. Remove a topic before adding more than ${MAX_ACTIVE_TOPICS}.`);
            return;
        }
        const topic = allTopics.find(t => t.article === article);
        if (!topic) return;

        chart.setTopicColor(article, topicColorAssignments[article]);
        chart.addTopic(topic);

        // Update sidebar
        d3.selectAll(".topic-item").filter(function() {
            return d3.select(this).attr("data-article") === article;
        }).classed("active", true);

        updateActiveChips();
        updateSpikePanel();
        updateInsightPanel();
    }

    function deactivateTopic(article) {
        chart.removeTopic(article);

        d3.selectAll(".topic-item").filter(function() {
            return d3.select(this).attr("data-article") === article;
        }).classed("active", false);

        updateActiveChips();
        updateSpikePanel();
        updateInsightPanel();
    }

    function updateActiveChips() {
        const container = d3.select("#active-chips");
        container.selectAll("*").remove();
        const hint = d3.select("#active-hint");

        if (chart.activeTopics.length === 0) {
            container.append("span")
                .attr("class", "placeholder-text")
                .text("Click topics in the sidebar to begin exploring");
            hint.text("Comparison works best with 2–5 topics.");
            return;
        }

        hint.text(
            chart.activeTopics.length >= MAX_ACTIVE_TOPICS
                ? `Topic limit reached (${MAX_ACTIVE_TOPICS}/${MAX_ACTIVE_TOPICS}). Remove one to add another.`
                : `Comparison works best with ${Math.max(2, chart.activeTopics.length)}–${MAX_ACTIVE_TOPICS} topics.`
        );

        chart.activeTopics.forEach(topic => {
            const color = topicColorAssignments[topic.article];
            const chip = container.append("span")
                .attr("class", "chip")
                .style("background", color + "22")
                .style("color", color)
                .style("border-color", color + "44")
                .on("click", () => deactivateTopic(topic.article))
                .on("mouseenter", () => chart.highlightTopic(topic.article))
                .on("mouseleave", () => chart.unhighlightAll());

            chip.append("span").text(topic.name);
            chip.append("span").attr("class", "chip-remove").html("&times;");
        });
    }

    function updateSpikePanel() {
        const container = d3.select("#spike-list");
        container.selectAll("*").remove();

        if (chart.activeTopics.length === 0) {
            container.append("p").attr("class", "placeholder-text").text("Add topics to see spikes");
            return;
        }

        const extent = chart.brushExtent || chart.fullXExtent;
        const spikes = getTopSpikes(chart.activeTopics, extent, 20, spikeMode);

        if (spikes.length === 0) {
            container.append("p").attr("class", "placeholder-text").text("No spikes found in this range");
            return;
        }

        spikes.forEach(spike => {
            const color = topicColorAssignments[spike.article];
            const item = container.append("div")
                .attr("class", "spike-item")
                .style("border-left-color", color)
                .on("click", () => {
                    chart.navigateToDate(spike.date, 20);
                })
                .on("mouseenter", () => chart.highlightTopic(spike.article))
                .on("mouseleave", () => chart.unhighlightAll());

            item.append("div").attr("class", "spike-date").text(formatDate(spike.date));
            item.append("div").attr("class", "spike-topic").style("color", color).text(spike.topicName);
            if (spikeMode === "relative") {
                item.append("div").attr("class", "spike-change")
                    .html(`<span class="spike-up">+${spike.pctChange.toFixed(1)}%</span> vs prev day`);
            } else {
                item.append("div").attr("class", "spike-change")
                    .html(`<span class="spike-up">+${formatNumber(spike.increase)}</span> views from prev day`);
            }
            item.append("div").attr("class", "spike-views").text(`${formatNumber(spike.views)} total views`);
        });
    }

    function updateSpikeDescription() {
        const desc = d3.select("#spike-desc");
        desc.text(
            spikeMode === "relative"
                ? "Largest day-over-day percentage surges in the current view"
                : "Largest day-over-day increases in the current view"
        );
    }

    function updateInsightPanel() {
        const container = d3.select("#insight-list");
        const windowEl = d3.select("#insight-window");
        container.selectAll("*").remove();

        if (!chart || chart.activeTopics.length === 0 || !chart.fullXExtent) {
            windowEl.text("Select topics to see comparative takeaways.");
            container.append("p").attr("class", "placeholder-text").text("Add 2–5 topics to generate attention insights.");
            return;
        }

        const extent = chart.brushExtent || chart.fullXExtent;
        windowEl.text(`${formatDate(extent[0])} – ${formatDate(extent[1])}`);

        if (chart.activeTopics.length < 2) {
            container.append("p")
                .attr("class", "placeholder-text")
                .text("Add one more topic to turn this view into a direct comparison.");
        }

        const topicSummaries = chart.activeTopics.map(topic => summarizeTopicInExtent(topic, extent)).filter(Boolean);
        if (topicSummaries.length === 0) {
            container.append("p").attr("class", "placeholder-text").text("No visible data in the current range.");
            return;
        }

        const highestPeak = d3.greatest(topicSummaries, d => d.peakDisplay);
        const fastestTakeoff = d3.greatest(topicSummaries, d => d.relativeSpike ? d.relativeSpike.pctChange : -Infinity);
        const longestAttention = d3.greatest(topicSummaries, d => d.daysAboveHalfPeak);

        const insights = [
            highestPeak ? {
                key: "peak",
                title: "Highest peak",
                article: highestPeak.article,
                date: highestPeak.peakDate,
                metric: `${formatInsightValue(highestPeak.peakDisplay)} on ${formatDate(highestPeak.peakDate)}`,
                detail: `${highestPeak.name} reached the largest ${viewMode === "indexed" ? "peak-normalized level" : "single-day attention peak"} in the current window.`,
            } : null,
            fastestTakeoff ? {
                key: "takeoff",
                title: "Steepest takeoff",
                article: fastestTakeoff.article,
                date: fastestTakeoff.relativeSpike ? fastestTakeoff.relativeSpike.date : fastestTakeoff.peakDate,
                metric: fastestTakeoff.relativeSpike
                    ? `+${fastestTakeoff.relativeSpike.pctChange.toFixed(1)}% day-over-day`
                    : `Peak reached on ${formatDate(fastestTakeoff.peakDate)}`,
                detail: fastestTakeoff.relativeSpike
                    ? `${fastestTakeoff.name} accelerated the fastest, suggesting a sudden information shock rather than a slow build.`
                    : `${fastestTakeoff.name} lacks a measurable relative spike in this range, but still stands out as a fast-rising topic.`,
            } : null,
            longestAttention ? {
                key: "sustained",
                title: "Most sustained attention",
                article: longestAttention.article,
                date: longestAttention.peakDate,
                metric: `${longestAttention.daysAboveHalfPeak} days above half of its peak`,
                detail: `${longestAttention.name} held attention the longest after peaking, indicating a broader or more persistent public conversation.`,
            } : null,
        ].filter(Boolean);

        const cards = container.selectAll(".insight-card")
            .data(insights, d => d.key);

        const enter = cards.enter()
            .append("button")
            .attr("type", "button")
            .attr("class", "insight-card")
            .on("click", (_, d) => {
                if (d.date) {
                    chart.navigateToDate(d.date, 24);
                }
            })
            .on("mouseenter", (_, d) => chart.highlightTopic(d.article))
            .on("mouseleave", () => chart.unhighlightAll());

        enter.append("div").attr("class", "insight-card-title");
        enter.append("div").attr("class", "insight-card-metric");
        enter.append("div").attr("class", "insight-card-detail");

        const merged = enter.merge(cards);
        merged.style("border-left-color", d => topicColorAssignments[d.article] || "var(--accent)");
        merged.select(".insight-card-title").text(d => d.title);
        merged.select(".insight-card-metric").text(d => d.metric);
        merged.select(".insight-card-detail").text(d => d.detail);

        cards.exit().remove();
    }

    function summarizeTopicInExtent(topic, extent) {
        const points = topic._parsed.filter(d => d.date >= extent[0] && d.date <= extent[1]);
        if (points.length === 0) return null;

        const peakPoint = d3.greatest(points, d => chart._getDisplayValue(topic, d));
        const peakDisplay = chart._getDisplayValue(topic, peakPoint);
        const relativeSpike = getTopSpikes([topic], extent, 1, "relative")[0] || null;

        return {
            article: topic.article,
            name: topic.name,
            peakDate: peakPoint.date,
            peakDisplay,
            averageDisplay: d3.mean(points, d => chart._getDisplayValue(topic, d)) || 0,
            daysAboveHalfPeak: points.filter(d => chart._getDisplayValue(topic, d) >= peakDisplay * 0.5).length,
            relativeSpike,
        };
    }

    function formatInsightValue(value) {
        return viewMode === "indexed"
            ? `${d3.format(".1f")(value)} indexed`
            : `${formatNumber(value)} views`;
    }

    function flashActiveHint(message) {
        const hint = d3.select("#active-hint");
        hint.text(message).classed("is-warning", true);
        window.clearTimeout(flashActiveHint._timeoutId);
        flashActiveHint._timeoutId = window.setTimeout(() => {
            hint.classed("is-warning", false);
            updateActiveChips();
        }, 2200);
    }

    function setTheme(theme, persist = true) {
        if (theme === 'light') {
            document.body.setAttribute('data-theme', 'light');
        } else {
            document.body.removeAttribute('data-theme');
        }
        if (persist) {
            localStorage.setItem(THEME_STORAGE_KEY, theme);
        }
        const btn = document.getElementById('theme-toggle');
        if (btn) {
            btn.classList.toggle('is-light', theme === 'light');
        }
        refreshThemeAccents();
    }
})();
