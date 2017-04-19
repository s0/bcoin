/*!
 * undocoins.js - undocoins object for bcoin
 * Copyright (c) 2014-2017, Christopher Jeffrey (MIT License).
 * https://github.com/bcoin-org/bcoin
 */

'use strict';

var assert = require('assert');
var BufferReader = require('../utils/reader');
var StaticWriter = require('../utils/staticwriter');
var RawCoin = require('../coins/rawcoin');

/**
 * UndoCoins
 * Coins need to be resurrected from somewhere
 * during a reorg. The undo coins store all
 * spent coins in a single record per block
 * (in a compressed format).
 * @alias module:coins.UndoCoins
 * @constructor
 * @property {UndoCoin[]} items
 */

function UndoCoins() {
  if (!(this instanceof UndoCoins))
    return new UndoCoins();

  this.items = [];
}

/**
 * Push coin entry onto undo coin array.
 * @param {CoinEntry}
 */

UndoCoins.prototype.push = function push(coin) {
  this.items.push(coin);
};

/**
 * Calculate undo coins size.
 * @returns {Number}
 */

UndoCoins.prototype.getSize = function getSize() {
  var size = 0;
  var i, coin;

  size += 4;

  for (i = 0; i < this.items.length; i++) {
    coin = this.items[i];
    size += coin.getSize();
  }

  return size;
};

/**
 * Serialize all undo coins.
 * @returns {Buffer}
 */

UndoCoins.prototype.toRaw = function toRaw() {
  var size = this.getSize();
  var bw = new StaticWriter(size);
  var i, coin;

  bw.writeU32(this.items.length);

  for (i = 0; i < this.items.length; i++) {
    coin = this.items[i];
    coin.toWriter(bw);
  }

  return bw.render();
};

/**
 * Inject properties from serialized data.
 * @private
 * @param {Buffer} data
 * @returns {UndoCoins}
 */

UndoCoins.prototype.fromRaw = function fromRaw(data) {
  var br = new BufferReader(data);
  var count = br.readU32();
  var i;

  for (i = 0; i < count; i++)
    this.items.push(RawCoin.fromReader(br));

  return this;
};

/**
 * Instantiate undo coins from serialized data.
 * @param {Buffer} data
 * @returns {UndoCoins}
 */

UndoCoins.fromRaw = function fromRaw(data) {
  return new UndoCoins().fromRaw(data);
};

/**
 * Test whether the undo coins have any members.
 * @returns {Boolean}
 */

UndoCoins.prototype.isEmpty = function isEmpty() {
  return this.items.length === 0;
};

/**
 * Render the undo coins.
 * @returns {Buffer}
 */

UndoCoins.prototype.commit = function commit() {
  var raw = this.toRaw();
  this.items.length = 0;
  return raw;
};

/**
 * Retrieve the last undo coin.
 * @returns {UndoCoin}
 */

UndoCoins.prototype.top = function top() {
  return this.items[this.items.length - 1];
};

/**
 * Re-apply undo coins to a view, effectively unspending them.
 * @param {CoinView} view
 * @param {Outpoint} outpoint
 */

UndoCoins.prototype.apply = function apply(view, outpoint) {
  var undo = this.items.pop();

  assert(undo);

  view.addEntry(outpoint.hash, outpoint.index, undo);
};

/*
 * Expose
 */

module.exports = UndoCoins;
