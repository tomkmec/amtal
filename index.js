let TestContext = require('./TestContext.js')
  , Report = require('./Report.js')

module.exports = {
	run: function run(scenarios, configuration, rampup) {
		return new TestContext(scenarios, configuration, rampup).run()
	},
	exportResults: function(dir) {
		return new Report(dir).exportPromise()
	}
}