/*!
 * coin.js - coin object for bcoin
 * Copyright (c) 2014-2017, Christopher Jeffrey (MIT License).
 * https://github.com/bcoin-org/bcoin
 */

'use strict';

var assert = require('assert');
var Output = require('../primitives/output');
var BufferReader = require('../utils/reader');
var StaticWriter = require('../utils/staticwriter');
var encoding = require('../utils/encoding');
var compressor = require('../coins/compress');
var Coin = require('../primitives/coin');
var compress = compressor.compress;
var decompress = compressor.decompress;

/**
 * Represents an unspent output.
 * @alias module:coins.CoinEntry
 * @constructor
 * @property {Number} version - Transaction version.
 * @property {Number} height - Transaction height (-1 if unconfirmed).
 * @property {Boolean} coinbase - Whether the containing
 * transaction is a coinbase.
 */

function CoinEntry() {
  if (!(this instanceof CoinEntry))
    return new CoinEntry();

  this.version = 1;
  this.height = -1;
  this.coinbase = false;
  this.output = new Output();
  this.spent = false;
  this.raw = null;
}

CoinEntry.prototype.toOutput = function toOutput() {
  return this.output;
};

CoinEntry.prototype.toCoin = function toCoin(hash, index) {
  var coin = new Coin();
  coin.version = this.version;
  coin.height = this.height;
  coin.coinbase = this.coinbase;
  coin.script = this.output.script;
  coin.value = this.output.value;
  coin.hash = hash;
  coin.index = index;
  return coin;
};

/**
 * Inject properties from TX.
 * @param {TX} tx
 * @param {Number} index
 */

CoinEntry.prototype.fromOutput = function fromOutput(output) {
  this.output = output;
  return this;
};

/**
 * Instantiate a coin from a TX
 * @param {TX} tx
 * @param {Number} index - Output index.
 * @returns {CoinEntry}
 */

CoinEntry.fromOutput = function fromOutput(output) {
  return new CoinEntry().fromOutput(output);
};

/**
 * Inject properties from TX.
 * @param {TX} tx
 * @param {Number} index
 */

CoinEntry.prototype.fromCoin = function fromCoin(coin) {
  this.version = coin.version;
  this.height = coin.height;
  this.coinbase = coin.coinbase;
  this.output.script = coin.script;
  this.output.value = coin.value;
  return this;
};

/**
 * Instantiate a coin from a TX
 * @param {TX} tx
 * @param {Number} index - Output index.
 * @returns {CoinEntry}
 */

CoinEntry.fromCoin = function fromCoin(coin) {
  return new CoinEntry().fromCoin(coin);
};

/**
 * Inject properties from TX.
 * @param {TX} tx
 * @param {Number} index
 */

CoinEntry.prototype.fromTX = function fromTX(tx, index, height) {
  assert(typeof index === 'number');
  assert(typeof height === 'number');
  assert(index >= 0 && index < tx.outputs.length);
  this.version = tx.version;
  this.height = height;
  this.coinbase = tx.isCoinbase();
  this.output = tx.outputs[index];
  return this;
};

/**
 * Instantiate a coin from a TX
 * @param {TX} tx
 * @param {Number} index - Output index.
 * @returns {CoinEntry}
 */

CoinEntry.fromTX = function fromTX(tx, index, height) {
  return new CoinEntry().fromTX(tx, index, height);
};

/**
 * Calculate size of coin.
 * @returns {Number}
 */

CoinEntry.prototype.getSize = function getSize() {
  var size;

  if (this.raw)
    return this.raw.length;

  size = 0;
  size += encoding.sizeVarint(this.version);
  size += 4;
  size += compress.size(this.output);

  return size;
};

/**
 * Write the coin to a buffer writer.
 * @param {BufferWriter} bw
 */

CoinEntry.prototype.toWriter = function toWriter(bw) {
  var code = 0;
  var height = this.height;

  if (this.raw) {
    bw.writeBytes(this.raw);
    return bw;
  }

  // We save 29 bits for the height.
  // This should be good for the next 4000 years.
  if (height === -1)
    height = 0x1fffffff;

  if (this.coinbase)
    code |= 1;

  height |= code << 29;

  bw.writeVarint(this.version);
  bw.writeU32(height);
  compress.output(this.output, bw);

  return bw;
};

/**
 * Serialize the coin.
 * @returns {Buffer|String}
 */

CoinEntry.prototype.toRaw = function toRaw() {
  var size, bw;

  if (this.raw)
    return this.raw;

  size = this.getSize();
  bw = new StaticWriter(size);

  this.toWriter(bw);

  this.raw = bw.render();

  return this.raw;
};

/**
 * Inject properties from serialized buffer writer.
 * @private
 * @param {BufferReader} br
 */

CoinEntry.prototype.fromReader = function fromReader(br) {
  var height, code;

  this.version = br.readVarint();

  height = br.readU32();

  code = height >>> 29;

  height &= 0x1fffffff;

  if (height === 0x1fffffff)
    height = -1;

  this.coinbase = (code & 1) !== 0;
  this.height = height;

  decompress.output(this.output, br);

  return this;
};

/**
 * Instantiate a coin from a serialized Buffer.
 * @param {Buffer} data
 * @returns {CoinEntry}
 */

CoinEntry.fromReader = function fromReader(data) {
  return new CoinEntry().fromReader(data);
};

/**
 * Inject properties from serialized data.
 * @private
 * @param {Buffer} data
 */

CoinEntry.prototype.fromRaw = function fromRaw(data) {
  this.fromReader(new BufferReader(data));
  this.raw = data;
  return this;
};

/**
 * Instantiate a coin from a serialized Buffer.
 * @param {Buffer} data
 * @returns {CoinEntry}
 */

CoinEntry.fromRaw = function fromRaw(data) {
  return new CoinEntry().fromRaw(data);
};

/*
 * Expose
 */

module.exports = CoinEntry;
