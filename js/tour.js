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
        this.takeawayEl = d3.select("#tour-takeaway");

        d3.select("#tour-prev").on("click", () => this.prev());
        d3.select("#tour-next").on("click", () => this.next());
        d3.select("#tour-close").on("click", () => this.stop());

        // Build steps from ANNOTATIONS
        this.steps = ANNOTATIONS.map(a => ({
            title: a.title,
            text: a.text,
            article: a.article,
            date: a.date,
            takeaway: "",
        })).concat([{
            title: "What these attention curves reveal",
            text: "Use the controls to compare not just who drew the most attention, but how fast different topics rose, peaked, and faded.",
            article: null,
            date: null,
            takeaway: "Notice that crises often spike faster, while entertainment and product launches are more likely to sustain longer attention tails.",
        }]);
    }

    start() {
        if (this.steps.length === 0) return;
        this.active = true;
        this.currentStep = 0;
        this.overlay.classed("hidden", false);
        this.takeawayEl.classed("hidden", true).text("");
        this._showStep();
    }

    stop() {
        this.active = false;
        this.overlay.classed("hidden", true);
        this.takeawayEl.classed("hidden", true).text("");
        this.chart.clearTourFocus();
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
        this.takeawayEl.classed("hidden", !step.takeaway).text(step.takeaway || "");

        if (step.article) {
            this.addTopicFn(step.article);
            this.chart.setTourFocus(step.article, step.date);

            const d = d3.timeParse("%Y%m%d")(step.date);
            if (d) {
                this.chart.navigateToDate(d, 45);
            }
        } else {
            this.chart.clearTourFocus();
        }

        d3.select("#tour-prev").property("disabled", this.currentStep === 0);
        d3.select("#tour-next").text(
            this.currentStep === this.steps.length - 1 ? "Finish" : "Next ▶"
        );
    }
}
