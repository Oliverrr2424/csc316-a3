// Guided tour through annotated spikes

class GuidedTour {
    constructor(chart, addTopicFn) {
        this.chart = chart;
        this.addTopicFn = addTopicFn;
        this.currentStep = 0;
        this.active = false;

        this.overlay = d3.select("#tour-overlay");
        this.titleEl = d3.select("#tour-title");
        this.textEl = d3.select("#tour-text");
        this.stepIndicator = d3.select("#tour-step-indicator");

        d3.select("#tour-prev").on("click", () => this.prev());
        d3.select("#tour-next").on("click", () => this.next());
        d3.select("#tour-close").on("click", () => this.stop());

        // Build steps from ANNOTATIONS
        this.steps = ANNOTATIONS.map((a, i) => ({
            title: a.title,
            text: a.text,
            article: a.article,
            date: a.date,
        }));
    }

    start() {
        if (this.steps.length === 0) return;
        this.active = true;
        this.currentStep = 0;
        this.overlay.classed("hidden", false);
        this._showStep();
    }

    stop() {
        this.active = false;
        this.overlay.classed("hidden", true);
    }

    next() {
        if (this.currentStep < this.steps.length - 1) {
            this.currentStep++;
            this._showStep();
        } else {
            this.stop();
        }
    }

    prev() {
        if (this.currentStep > 0) {
            this.currentStep--;
            this._showStep();
        }
    }

    _showStep() {
        const step = this.steps[this.currentStep];
        this.stepIndicator.text(`Step ${this.currentStep + 1} of ${this.steps.length}`);
        this.titleEl.text(step.title);
        this.textEl.text(step.text);

        // Ensure the topic is active
        this.addTopicFn(step.article);

        // Navigate chart to the date
        const d = d3.timeParse("%Y%m%d")(step.date);
        if (d) {
            this.chart.navigateToDate(d, 45);
        }

        // Update button states
        d3.select("#tour-prev").property("disabled", this.currentStep === 0);
        d3.select("#tour-next").text(
            this.currentStep === this.steps.length - 1 ? "Finish" : "Next ▶"
        );
    }
}
