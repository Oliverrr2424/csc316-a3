// Spike detection utilities

/**
 * Compute day-over-day absolute increases for a topic's timeseries.
 * Returns array of { date, views, prevViews, increase, topic }
 */
function computeSpikes(topicData, dateExtent) {
    const ts = topicData.timeseries;
    if (!ts || ts.length < 2) return [];

    const parseDate = d3.timeParse("%Y%m%d");
    const spikes = [];

    for (let i = 1; i < ts.length; i++) {
        const d = parseDate(ts[i].date);
        if (!d) continue;
        if (dateExtent && (d < dateExtent[0] || d > dateExtent[1])) continue;

        const increase = ts[i].views - ts[i - 1].views;
        if (increase > 0) {
            spikes.push({
                date: d,
                dateStr: ts[i].date,
                views: ts[i].views,
                prevViews: ts[i - 1].views,
                increase: increase,
                pctChange: ts[i - 1].views > 0 ? (increase / ts[i - 1].views) * 100 : 0,
                topicName: topicData.name,
                article: topicData.article,
                theme: topicData.theme,
            });
        }
    }

    return spikes;
}

/**
 * Get top K spikes across all active topics.
 * sortMode: 'absolute' (default) or 'relative'
 */
function getTopSpikes(activeTopics, dateExtent, k = 15, sortMode = 'absolute') {
    let allSpikes = [];
    activeTopics.forEach(topic => {
        const spikes = computeSpikes(topic, dateExtent);
        allSpikes = allSpikes.concat(spikes);
    });

    if (sortMode === 'relative') {
        // Filter out spikes with very low base to avoid noise
        allSpikes = allSpikes.filter(s => s.prevViews >= 100);
        allSpikes.sort((a, b) => b.pctChange - a.pctChange);
    } else {
        allSpikes.sort((a, b) => b.increase - a.increase);
    }
    return allSpikes.slice(0, k);
}

/**
 * Format a number with commas.
 */
function formatNumber(n) {
    return d3.format(",")(Math.round(n));
}

/**
 * Format a date for display.
 */
function formatDate(d) {
    return d3.timeFormat("%b %d, %Y")(d);
}
