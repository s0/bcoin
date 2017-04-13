/*!
 * coins.js - coins object for bcoin
 * Copyright (c) 2014-2017, Christopher Jeffrey (MIT License).
 * https://github.com/bcoin-org/bcoin
 */

'use strict';

var util = require('../utils/util');
var assert = require('assert');
var Coin = require('../primitives/coin');
var Output = require('../primitives/output');
var BufferReader = require('../utils/reader');
var StaticWriter = require('../utils/staticwriter');
var encoding = require('../utils/encoding');
var compressor = require('./compress');
var compress = compressor.compress;
var decompress = compressor.decompress;

/**
 * Represents the outputs for a single transaction.
 * @alias module:coins.Coins
 * @constructor
 * @param {Object?} options - Options object.
 * @property {Hash} hash - Transaction hash.
 * @property {Number} version - Transaction version.
 * @property {Number} height - Transaction height (-1 if unconfirmed).
 * @property {Boolean} coinbase - Whether the containing
 * transaction is a coinbase.
 * @property {CoinEntry[]} outputs - Coins.
 */

function Coins(options) {
  if (!(this instanceof Coins))
    return new Coins(options);

  this.version = 1;
  this.hash = encoding.NULL_HASH;
  this.height = -1;
  this.coinbase = true;
  this.outputs = [];

  if (options)
    this.fromOptions(options);
}

/**
 * Inject properties from options object.
 * @private
 * @param {Object} options
 */

Coins.prototype.fromOptions = function fromOptions(options) {
  if (options.version != null) {
    assert(util.isUInt32(options.version));
    this.version = options.version;
  }

  if (options.hash) {
    assert(typeof options.hash === 'string');
    this.hash = options.hash;
  }

  if (options.height != null) {
    assert(util.isNumber(options.height));
    this.height = options.height;
  }

  if (options.coinbase != null) {
    assert(typeof options.coinbase === 'boolean');
    this.coinbase = options.coinbase;
  }

  if (options.outputs) {
    assert(Array.isArray(options.outputs));
    this.outputs = options.outputs;
    this.cleanup();
  }

  return this;
};

/**
 * Instantiate coins from options object.
 * @param {Object} options
 * @returns {Coins}
 */

Coins.fromOptions = function fromOptions(options) {
  return new Coins().fromOptions(options);
};

/**
 * Add a single entry to the collection.
 * @param {Number} index
 * @param {CoinEntry} entry
 */

Coins.prototype.add = function add(index, entry) {
  assert(index >= 0);

  while (this.outputs.length <= index)
    this.outputs.push(null);

  assert(!this.outputs[index]);

  this.outputs[index] = entry;
};

/**
 * Add a single output to the collection.
 * @param {Number} index
 * @param {Output} output
 */

Coins.prototype.addOutput = function addOutput(index, output) {
  assert(!output.script.isUnspendable());
  this.add(index, CoinEntry.fromOutput(this, output));
};

/**
 * Add a single coin to the collection.
 * @param {Coin} coin
 */

Coins.prototype.addCoin = function addCoin(coin) {
  assert(!coin.script.isUnspendable());
  this.add(coin.index, CoinEntry.fromCoin(this, coin));
};

/**
 * Test whether the collection has a coin.
 * @param {Number} index
 * @returns {Boolean}
 */

Coins.prototype.has = function has(index) {
  if (index >= this.outputs.length)
    return false;

  return this.outputs[index] != null;
};

/**
 * Test whether the collection
 * has an unspent coin.
 * @param {Number} index
 * @returns {Boolean}
 */

Coins.prototype.isUnspent = function isUnspent(index) {
  var output;

  if (index >= this.outputs.length)
    return false;

  output = this.outputs[index];

  if (!output || output.spent)
    return false;

  return true;
};

/**
 * Get a coin entry.
 * @param {Number} index
 * @returns {CoinEntry}
 */

Coins.prototype.get = function get(index) {
  if (index >= this.outputs.length)
    return;

  return this.outputs[index];
};

/**
 * Get an output.
 * @param {Number} index
 * @returns {Output}
 */

Coins.prototype.getOutput = function getOutput(index) {
  var entry = this.get(index);

  if (!entry)
    return;

  return entry.toOutput();
};

/**
 * Get a coin.
 * @param {Number} index
 * @returns {Coin}
 */

Coins.prototype.getCoin = function getCoin(index) {
  var entry = this.get(index);

  if (!entry)
    return;

  return entry.toCoin(index);
};

/**
 * Spend a coin entry and return it.
 * @param {Number} index
 * @returns {CoinEntry}
 */

Coins.prototype.spend = function spend(index) {
  var entry = this.get(index);

  if (!entry || entry.spent)
    return;

  entry.spent = true;

  return entry;
};

/**
 * Remove a coin entry and return it.
 * @param {Number} index
 * @returns {CoinEntry}
 */

Coins.prototype.remove = function remove(index) {
  var entry = this.get(index);

  if (!entry)
    return false;

  this.outputs[index] = null;
  this.cleanup();

  return entry;
};

/**
 * Calculate unspent length of coins.
 * @returns {Number}
 */

Coins.prototype.length = function length() {
  var len = this.outputs.length;

  while (len > 0 && !this.isUnspent(len - 1))
    len--;

  return len;
};

/**
 * Cleanup spent outputs (remove pruned).
 */

Coins.prototype.cleanup = function cleanup() {
  var len = this.outputs.length;

  while (len > 0 && !this.outputs[len - 1])
    len--;

  this.outputs.length = len;
};

/**
 * Test whether the coins are fully spent.
 * @returns {Boolean}
 */

Coins.prototype.isEmpty = function isEmpty() {
  return this.length() === 0;
};

/**
 * Inject properties from tx.
 * @private
 * @param {TX} tx
 * @param {Number} height
 */

Coins.prototype.fromTX = function fromTX(tx, height) {
  var i, output;

  assert(typeof height === 'number');

  this.version = tx.version;
  this.hash = tx.hash('hex');
  this.height = height;
  this.coinbase = tx.isCoinbase();

  for (i = 0; i < tx.outputs.length; i++) {
    output = tx.outputs[i];

    if (output.script.isUnspendable()) {
      this.outputs.push(null);
      continue;
    }

    this.outputs.push(CoinEntry.fromOutput(this, output));
  }

  this.cleanup();

  return this;
};

/**
 * Instantiate a coins object from a transaction.
 * @param {TX} tx
 * @param {Number} height
 * @returns {Coins}
 */

Coins.fromTX = function fromTX(tx, height) {
  return new Coins().fromTX(tx, height);
};

Coins.prototype.addRaw = function addRaw(raw) {
  var height, code;

  this.version = br.readVarint();

  height = br.readU32();

  code = height >>> 29;

  height &= 0x1fffffff;

  if (height === 0x1fffffff)
    height = -1;

  this.coinbase = (code & 1) !== 0;
  this.height = height;

  decompress.coin(this, br);

  return this;
};

/**
 * A coin entry is an object which defers
 * parsing of a coin. Say there is a transaction
 * with 100 outputs. When a block comes in,
 * there may only be _one_ input in that entire
 * block which redeems an output from that
 * transaction. When parsing the Coins, there
 * is no sense to get _all_ of them into their
 * abstract form. A coin entry is just a
 * pointer to that coin in the Coins buffer, as
 * well as a size. Parsing and decompression
 * is done only if that coin is being redeemed.
 * @alias module:coins.CoinEntry
 * @constructor
 * @property {Number} offset
 * @property {Number} size
 * @property {Buffer} raw
 * @property {Output|null} output
 * @property {Boolean} spent
 */

function CoinEntry() {
  this.raw = null;
  this.coin = null;
  this.spent = false;
}

/**
 * Parse the deferred data and return a coin.
 * @param {Coins} coins
 * @param {Number} index
 * @returns {Coin}
 */

CoinEntry.prototype.toCoin = function toCoin(index) {
  var coin = Coin.fromRaw(this.raw);
  coin.hash = this.coins.hash;
  coin.index = index;
  return coin;
};

/**
 * Parse the deferred data and return a coin.
 * @param {Coins} coins
 * @param {Number} index
 * @returns {Coin}
 */

CoinEntry.prototype.toCoin = function toCoin(index) {
  var coin = new Coin();
  var output = this.toOutput();

  // Load in all necessary properties
  // from the parent Coins object.
  coin.version = this.coins.version;
  coin.coinbase = this.coins.coinbase;
  coin.height = this.coins.height;
  coin.hash = this.coins.hash;
  coin.index = index;
  coin.script = output.script;
  coin.value = output.value;

  return coin;
};

/**
 * Parse the deferred data and return an output.
 * @returns {Output}
 */

CoinEntry.prototype.toOutput = function toOutput() {
  var br;

  if (!this.output) {
    this.output = new Output();

    br = new BufferReader(this.raw);
    br.skipVarint();
    br.seek(4);

    decompress.output(this.output, br);
  }

  return this.output;
};

/**
 * Calculate coin entry size.
 * @returns {Number}
 */

CoinEntry.prototype.getSize = function getSize() {
  if (!this.raw)
    return compress.size(this.output);

  return this.size;
};

/**
 * Slice off the part of the buffer
 * relevant to this particular coin.
 */

CoinEntry.prototype.toWriter = function toWriter(bw) {
  if (!this.raw) {
    assert(this.output);
    this.toCoin(0).toCompressedWriter(bw);
    return bw;
  }

  // If we read this coin from the db and
  // didn't use it, it's still in its
  // compressed form. Just write it back
  // as a buffer for speed.
  bw.writeBytes(this.raw);

  return bw;
};

/**
 * Instantiate coin entry from reader.
 * @param {BufferReader} br
 * @returns {CoinEntry}
 */

CoinEntry.fromReader = function fromReader(coins, br) {
  var entry = new CoinEntry();
  entry.coins = coins;
  entry.raw = br.data;
  return entry;
};

/**
 * Instantiate coin entry from output.
 * @param {Output} output
 * @returns {CoinEntry}
 */

CoinEntry.fromOutput = function fromOutput(coins, output) {
  var entry = new CoinEntry();
  entry.coins = coins;
  entry.output = output;
  return entry;
};

/**
 * Instantiate coin entry from coin.
 * @param {Coin} coin
 * @returns {CoinEntry}
 */

CoinEntry.fromCoin = function fromCoin(coins, coin) {
  var entry = new CoinEntry();
  var output = new Output();
  output.value = coin.value;
  output.script = coin.script;
  entry.coins = coins;
  entry.output = output;
  return entry;
};

/*
 * Expose
 */

exports = Coins;
exports.Coins = Coins;
exports.CoinEntry = CoinEntry;

module.exports = exports;
