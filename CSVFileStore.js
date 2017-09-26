let fs = require('fs')
  , _ = require('underscore')
  , util = require('./util.js')
  , csv = require("fast-csv")
  , stream = require('stream')

class CSVStream extends stream.Transform {
	constructor(properties) {
		super({objectMode: true})
		this.props = properties;
      	this.headerRow = true;
	}

	_transform(chunk, encoding, callback) {
		if (this.headerRow) {
			this.headerRow = false;
			callback();
		} else {
			callback(null, _.object(this.props, chunk));
		}
	}

	_flush(callback) {
		callback();
	}

	_final(callback) {
		callback();
	}
}

module.exports = class CSVFileStore {
	constructor(path, options) {
		this.options = _.defaults(options, {bufferSize: 10});
		this.path = path;
		this.file = fs.openSync(path, 'w');
		this.lock = false;
		this.buffer = [];
		fs.writeSync(this.file, options.headerCSV + "\n", 'utf8');
	}

	store(entry) {
		this.buffer.push(entry);
		if (this.buffer.length == this.options.bufferSize) {
			this._flush(this.buffer);
			this.buffer = [];
		}
	}

	read () {
		let self = this;
		fs.closeSync(this.file);
		return csv
         .fromPath(this.path)
         .pipe(new CSVStream(self.options.properties))
	}

	_flush(entries, lockOverride) {
		var queue = [];
		if (!this.lock || lockOverride) {
			this.lock = true;
			var lines = entries.map(entry => this.options.properties.map(prop => util.getProp(entry, prop)).join(',')).join('\n') + "\n";
			fs.write(this.file, lines, 'utf8', () => {
				if (queue.length > 0) {
					this._flush(queue, true);
				} else {
					this.lock = false;
				}
			})
		} else {
			queue = queue.concat(entries);
		}
	}
}