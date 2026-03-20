// Main application entry point

(function () {
    let allTopics = [];
    let chart = null;
    let tour = null;
    let topicColorAssignments = {};

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
            .style("color", "#ff6b6b")
            .text("Failed to load pageview data. Make sure data/pageviews.json exists.");
    });

    function init() {
        // Assign colors to topics
        assignColors();

        // Initialize chart
        chart = new AttentionChart("#main-chart", "#context-chart");
        chart.onBrushChange = (extent) => {
            updateSpikePanel();
        };

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
        });
        d3.select("#show-annotations").on("change", function () {
            chart.setShowAnnotations(this.checked);
        });
        d3.select("#topic-search").on("input", function () {
            filterSidebar(this.value.toLowerCase().trim());
        });

        // Start with a few interesting default topics
        const defaults = [
            "COVID-19_pandemic",
            "Queen_Elizabeth_II",
            "ChatGPT",
            "Taylor_Swift",
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

    function buildSidebar() {
        const themeList = d3.select("#theme-list");

        // Group topics by theme
        const byTheme = {};
        allTopics.forEach(t => {
            if (!byTheme[t.theme]) byTheme[t.theme] = [];
            byTheme[t.theme].push(t);
        });

        Object.entries(byTheme).forEach(([theme, topics]) => {
            const group = themeList.append("div").attr("class", "theme-group");

            const header = group.append("div")
                .attr("class", "theme-group-header")
                .on("click", function () {
                    group.classed("collapsed", !group.classed("collapsed"));
                });

            header.append("span")
                .attr("class", "theme-dot")
                .style("background", THEME_COLORS[theme] || "#888");

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
    }

    function deactivateTopic(article) {
        chart.removeTopic(article);

        d3.selectAll(".topic-item").filter(function() {
            return d3.select(this).attr("data-article") === article;
        }).classed("active", false);

        updateActiveChips();
        updateSpikePanel();
    }

    function updateActiveChips() {
        const container = d3.select("#active-chips");
        container.selectAll("*").remove();

        if (chart.activeTopics.length === 0) {
            container.append("span")
                .attr("class", "placeholder-text")
                .text("Click topics in the sidebar to begin exploring");
            return;
        }

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
        const spikes = getTopSpikes(chart.activeTopics, extent, 20);

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
            item.append("div").attr("class", "spike-change")
                .html(`<span class="spike-up">+${formatNumber(spike.increase)}</span> views from prev day`);
            item.append("div").attr("class", "spike-views").text(`${formatNumber(spike.views)} total views`);
        });
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
    }
})();
