// Guided tour through annotated spikes

class GuidedTour {
    constructor(chart, addTopicFn) {
        this.chart = chart;
        this.addTopicFn = addTopicFn;
        this.currentStep = 0;
        this.active = false;

        this.overlay = d3.select("#tour-overlay");
        this.card = d3.select(".tour-card");
        this.titleEl = d3.select("#tour-title");
        this.textEl = d3.select("#tour-text");
        this.stepIndicator = d3.select("#tour-step-indicator");
        this.dragState = null;

        d3.select("#tour-prev").on("click", () => this.prev());
        d3.select("#tour-next").on("click", () => this.next());
        d3.select("#tour-close").on("click", () => this.stop());

        this.steps = [...ANNOTATIONS].sort((a, b) => {
            if (a.date === b.date) return a.title.localeCompare(b.title);
            return a.date.localeCompare(b.date);
        }).map(a => ({
            title: a.title,
            text: a.text,
            article: a.article,
            date: a.date,
            insight: a.insight || null,
            compareTopic: a.compareTopic || null,
            compareLabel: a.compareLabel || null,
        }));

        this._tourCompareTopics = new Set();

        this.takeaway = "Notice that crises (like COVID, Ukraine) spike faster and higher, while entertainment topics (Barbie, Squid Game) often have longer tails of sustained curiosity.";
        this._initDrag();
    }

    start() {
        if (this.steps.length === 0) return;
        this.active = true;
        this.currentStep = 0;
        this.overlay.classed("hidden", false);
        this._resetCardPosition();
        this._showStep();
    }

    stop() {
        this.active = false;
        this.overlay.classed("hidden", true);
        this._clearHighlights();
        this._resetCardPosition();
        this._tourCompareTopics.clear();
    }

    next() {
        if (this.currentStep < this.steps.length - 1) {
            this.currentStep++;
            this._showStep();
        } else {
            this._showTakeaway();
        }
    }

    prev() {
        if (this.currentStep > 0) {
            this.currentStep--;
            this._showStep();
        }
    }

    _clearHighlights() {
        this.chart.unhighlightAll();
        d3.selectAll(".annotation-marker").classed("tour-highlight", false);
    }

    _resetCardPosition() {
        this.card
            .style("left", "50%")
            .style("top", "60px")
            .style("transform", "translateX(-50%)")
            .classed("dragging", false);
    }

    _initDrag() {
        const cardNode = this.card.node();
        if (!cardNode) return;

        cardNode.addEventListener("mousedown", (event) => {
            if (event.target.closest("button")) return;

            const rect = cardNode.getBoundingClientRect();
            this.dragState = {
                offsetX: event.clientX - rect.left,
                offsetY: event.clientY - rect.top,
            };

            this.card
                .style("left", rect.left - this.overlay.node().getBoundingClientRect().left + "px")
                .style("top", rect.top - this.overlay.node().getBoundingClientRect().top + "px")
                .style("transform", "none")
                .classed("dragging", true);

            event.preventDefault();
        });

        window.addEventListener("mousemove", (event) => {
            if (!this.dragState || !this.active) return;

            const overlayRect = this.overlay.node().getBoundingClientRect();
            const cardRect = cardNode.getBoundingClientRect();
            const nextLeft = Math.min(
                Math.max(12, event.clientX - overlayRect.left - this.dragState.offsetX),
                overlayRect.width - cardRect.width - 12
            );
            const nextTop = Math.min(
                Math.max(12, event.clientY - overlayRect.top - this.dragState.offsetY),
                overlayRect.height - cardRect.height - 12
            );

            this.card
                .style("left", nextLeft + "px")
                .style("top", nextTop + "px");
        });

        window.addEventListener("mouseup", () => {
            if (!this.dragState) return;
            this.dragState = null;
            this.card.classed("dragging", false);
        });
    }

    _showStep() {
        const step = this.steps[this.currentStep];
        this.stepIndicator.text(`Step ${this.currentStep + 1} of ${this.steps.length}`);
        this.titleEl.text(step.title);
        this.textEl.text(step.text);

        this.overlay.select(".tour-takeaway").remove();

        // Render insight block
        this.card.select(".tour-insight").remove();
        this.card.select(".tour-compare-label").remove();
        if (step.insight) {
            this.card
                .insert("div", ".tour-nav")
                .attr("class", "tour-insight")
                .text(step.insight);
        }

        // Add comparison topic if specified
        if (step.compareTopic) {
            this.addTopicFn(step.compareTopic);
            this._tourCompareTopics.add(step.compareTopic);
            if (step.compareLabel) {
                this.card
                    .insert("div", ".tour-nav")
                    .attr("class", "tour-compare-label")
                    .text(step.compareLabel);
            }
        }

        // Add main topic
        this.addTopicFn(step.article);

        this.chart.highlightTopic(step.article, step.compareTopic || undefined);

        const d = d3.timeParse("%Y%m%d")(step.date);
        if (d) {
            this.chart.navigateToDate(d, 45);
        }

        setTimeout(() => {
            d3.selectAll(".annotation-marker").classed("tour-highlight", false);
            d3.selectAll(".annotation-marker")
                .filter(a => a.article === step.article && a.date === step.date)
                .classed("tour-highlight", true);
        }, 700);

        d3.select("#tour-prev").property("disabled", this.currentStep === 0);
        d3.select("#tour-next")
            .style("display", null)
            .on("click", () => this.next())
            .text(
                this.currentStep === this.steps.length - 1 ? "Finish ✓" : "Next ▶"
            );
    }

    _showTakeaway() {
        this._clearHighlights();
        this.stepIndicator.text("Tour Complete");
        this.titleEl.text("What did you notice?");
        this.textEl.text("");

        this.card.select(".tour-insight").remove();
        this.card.select(".tour-compare-label").remove();
        this.overlay.select(".tour-takeaway").remove();

        d3.select(".tour-card").append("div")
            .attr("class", "tour-takeaway")
            .text(this.takeaway);

        d3.select("#tour-prev").property("disabled", false);
        d3.select("#tour-next").style("display", "none");
    }
}
