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

  this.hash = encoding.NULL_HASH;
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
  if (options.hash) {
    assert(typeof options.hash === 'string');
    this.hash = options.hash;
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
 * @param {Coin} coin
 */

Coins.prototype.add = function add(index, coin) {
  assert(index >= 0);

  while (this.outputs.length <= index)
    this.outputs.push(null);

  assert(!this.outputs[index]);

  this.outputs[index] = coin;
};

/**
 * Add a single output to the collection.
 * @param {Hash} hash
 * @param {Number} index
 * @param {Output} output
 */

Coins.prototype.addOutput = function addOutput(index, output) {
  var coin;

  assert(!output.script.isUnspendable());

  coin = new Coin();
  coin.script = output.script;
  coin.value = output.value;
  coin.coinbase = false;
  coin.hash = this.hash;
  coin.index = index;

  this.add(index, coin);
};

/**
 * Add a single coin to the collection.
 * @param {Coin} coin
 */

Coins.prototype.addCoin = function addCoin(coin) {
  assert(!coin.script.isUnspendable());
  this.add(coin.index, coin);
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
  var coin;

  if (index >= this.outputs.length)
    return false;

  coin = this.outputs[index];

  if (!coin || coin.spent)
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
 * Spend a coin entry and return it.
 * @param {Number} index
 * @returns {CoinEntry}
 */

Coins.prototype.spend = function spend(index) {
  var coin = this.get(index);

  if (!coin || coin.spent)
    return;

  coin.spent = true;

  return coin;
};

/**
 * Remove a coin entry and return it.
 * @param {Number} index
 * @returns {CoinEntry}
 */

Coins.prototype.remove = function remove(index) {
  var coin = this.get(index);

  if (!coin)
    return false;

  this.outputs[index] = null;
  this.cleanup();

  return coin;
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

  this.hash = tx.hash('hex');

  for (i = 0; i < tx.outputs.length; i++) {
    output = tx.outputs[i];

    if (output.script.isUnspendable()) {
      this.outputs.push(null);
      continue;
    }

    this.outputs.push(Coin.fromTX(tx, i, height));
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

/*
 * Expose
 */

module.exports = Coins;
