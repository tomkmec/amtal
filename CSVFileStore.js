let fs = require('fs')
  , _ = require('underscore')
  , util = require('./util.js')

module.exports = class CSVFileStore {
	constructor(path, headerCSV, properties) {
		this.properties = properties;
		this.file = fs.openSync(path, 'a');
		fs.writeFileSync(this.file, headerCSV + "\n", 'utf8')
	}

	store(entry) {
		fs.writeFile(this.file, this.properties.map(prop => util.getProp(entry, prop)).join(',') + "\n", 'utf8', () => {})
	}
}