let TestContext = require('./TestContext.js')
  , Report = require('./Report.js')

module.exports = {
	run: function run(scenario, configuration, rampup) {
		return new TestContext(scenario, configuration, rampup).run()
	},
	exportResults: function(dir) {
		return new Report(dir).exportPromise()
	}
}