/*!
 * coinview.js - coin viewpoint object for bcoin
 * Copyright (c) 2014-2017, Christopher Jeffrey (MIT License).
 * https://github.com/bcoin-org/bcoin
 */

'use strict';

var assert = require('assert');
var co = require('../utils/co');
var Coins = require('./coins');
var UndoCoins = require('./undocoins');
var BufferReader = require('../utils/reader');
var BufferWriter = require('../utils/writer');
var CoinEntry = Coins.CoinEntry;

/**
 * Represents a coin viewpoint:
 * a snapshot of {@link Coins} objects.
 * @alias module:coins.CoinView
 * @constructor
 * @property {Object} map
 * @property {UndoCoins} undo
 */

function CoinView() {
  if (!(this instanceof CoinView))
    return new CoinView();

  this.map = {};
  this.undo = new UndoCoins();
}

/**
 * Get coins.
 * @param {Hash} hash
 * @returns {Coins} coins
 */

CoinView.prototype.get = function get(hash) {
  return this.map[hash];
};

/**
 * Test whether the view has an entry.
 * @param {Hash} hash
 * @returns {Boolean}
 */

CoinView.prototype.has = function has(hash) {
  return this.map[hash] != null;
};

/**
 * Add coins to the collection.
 * @param {Coins} coins
 */

CoinView.prototype.add = function add(coins) {
  this.map[coins.hash] = coins;
  return coins;
};

/**
 * Remove coins from the collection.
 * @param {Coins} coins
 * @returns {Boolean}
 */

CoinView.prototype.remove = function remove(hash) {
  if (!this.map[hash])
    return false;

  delete this.map[hash];

  return true;
};

/**
 * Add a tx to the collection.
 * @param {TX} tx
 * @param {Number} height
 */

CoinView.prototype.addTX = function addTX(tx, height) {
  var coins = Coins.fromTX(tx, height);
  return this.add(coins);
};

/**
 * Remove a tx from the collection.
 * @param {TX} tx
 * @param {Number} height
 */

CoinView.prototype.removeTX = function removeTX(tx, height) {
  var coins = Coins.fromTX(tx, height);
  var i, coin;

  for (i = 0; i < coins.outputs.length; i++) {
    coin = coins.outputs[i];
    coin.spent = true;
  }

  return this.add(coins);
};

/**
 * Add a coin to the collection.
 * @param {Coin} coin
 */

CoinView.prototype.addCoin = function addCoin(coin) {
  var coins = this.get(coin.hash);

  if (!coins) {
    coins = new Coins();
    coins.hash = coin.hash;
    this.add(coins);
  }

  if (coin.script.isUnspendable())
    return;

  if (!coins.has(coin.index))
    coins.addCoin(coin);

  return coins;
};

/**
 * Add an output to the collection.
 * @param {Hash} hash
 * @param {Number} index
 * @param {Output} output
 */

CoinView.prototype.addOutput = function addOutput(hash, index, output) {
  var coins = this.get(hash);

  if (!coins) {
    coins = new Coins();
    coins.hash = hash;
    this.add(coins);
  }

  if (output.script.isUnspendable())
    return;

  if (!coins.has(index))
    coins.addOutput(index, output);
};

/**
 * Spend an output.
 * @param {Hash} hash
 * @param {Number} index
 * @returns {Boolean}
 */

CoinView.prototype.spendOutput = function spendOutput(hash, index) {
  var coins = this.get(hash);

  if (!coins)
    return false;

  return this.spendFrom(coins, index);
};

/**
 * Remove an output.
 * @param {Hash} hash
 * @param {Number} index
 * @returns {Boolean}
 */

CoinView.prototype.removeOutput = function removeOutput(hash, index) {
  var coins = this.get(hash);

  if (!coins)
    return false;

  return coins.remove(index);
};

/**
 * Spend a coin from coins object.
 * @param {Coins} coins
 * @param {Number} index
 * @returns {Boolean}
 */

CoinView.prototype.spendFrom = function spendFrom(coins, index) {
  var coin = coins.spend(index);
  var undo;

  if (!coin)
    return false;

  this.undo.push(coin);

  return true;
};

/**
 * Get a single coin by input.
 * @param {Input} input
 * @returns {Coin}
 */

CoinView.prototype.getCoin = function getCoin(input) {
  var coins = this.get(input.prevout.hash);

  if (!coins)
    return;

  return coins.get(input.prevout.index);
};

/**
 * Get a single output by input.
 * @param {Input} input
 * @returns {Output}
 */

CoinView.prototype.getOutput = function getOutput(input) {
  return this.getCoin(input);
};

/**
 * Get a single entry by input.
 * @param {Input} input
 * @returns {CoinEntry}
 */

CoinView.prototype.getEntry = function getEntry(input) {
  var coins = this.get(input.prevout.hash);

  if (!coins)
    return;

  return coins.get(input.prevout.index);
};

/**
 * Test whether the view has an entry by input.
 * @param {Input} input
 * @returns {Boolean}
 */

CoinView.prototype.hasEntry = function hasEntry(input) {
  var coins = this.get(input.prevout.hash);

  if (!coins)
    return false;

  return coins.has(input.prevout.index);
};

/**
 * Get coins height by input.
 * @param {Input} input
 * @returns {Number}
 */

CoinView.prototype.getHeight = function getHeight(input) {
  var coin = this.getOutput(input);

  if (!coin)
    return -1;

  return coin.height;
};

/**
 * Get coins coinbase flag by input.
 * @param {Input} input
 * @returns {Boolean}
 */

CoinView.prototype.isCoinbase = function isCoinbase(input) {
  var coin = this.getOutput(input);

  if (!coin)
    return false;

  return coins.coinbase;
};

/**
 * Retrieve coins from database.
 * @method
 * @param {ChainDB} db
 * @param {TX} tx
 * @returns {Promise} - Returns {@link Coins}.
 */

CoinView.prototype.readCoin = co(function* readCoin(db, input) {
  var coin = this.getCoin(input);
  var prevout = input.prevout;

  if (!coin) {
    coin = yield db.getCoin(prevout.hash, prevout.index);

    if (!coin)
      return;

    return this.addCoin(coin);
  }

  return this.get(prevout.hash);
});

/**
 * Read all input coins into unspent map.
 * @method
 * @param {ChainDB} db
 * @param {TX} tx
 * @returns {Promise} - Returns {Boolean}.
 */

CoinView.prototype.ensureInputs = co(function* ensureInputs(db, tx) {
  var found = true;
  var i, input;

  for (i = 0; i < tx.inputs.length; i++) {
    input = tx.inputs[i];
    if (!(yield this.readCoin(db, input)))
      found = false;
  }

  return found;
});

/**
 * Spend coins for transaction.
 * @method
 * @param {ChainDB} db
 * @param {TX} tx
 * @returns {Promise} - Returns {Boolean}.
 */

CoinView.prototype.spendInputs = co(function* spendInputs(db, tx) {
  var i, input, coins;

  for (i = 0; i < tx.inputs.length; i++) {
    input = tx.inputs[i];
    coins = yield this.readCoin(db, input);

    if (!coins)
      return false;

    if (!this.spendFrom(coins, input.prevout.index))
      return false;
  }

  return true;
});

/**
 * Convert collection to an array.
 * @returns {Coins[]}
 */

CoinView.prototype.toArray = function toArray() {
  var keys = Object.keys(this.map);
  var out = [];
  var i, hash;

  for (i = 0; i < keys.length; i++) {
    hash = keys[i];
    out.push(this.map[hash]);
  }

  return out;
};

/**
 * Calculate serialization size.
 * @returns {Number}
 */

CoinView.prototype.getFastSize = function getFastSize(tx) {
  var size = 0;
  var i, input, coin;

  size += tx.inputs.length;

  for (i = 0; i < tx.inputs.length; i++) {
    input = tx.inputs[i];
    coin = this.getCoin(input);

    if (!coin)
      continue;

    size += coin.getSize();
  }

  return size;
};

/**
 * Write coin data to buffer writer
 * as it pertains to a transaction.
 * @param {BufferWriter} bw
 * @param {TX} tx
 */

CoinView.prototype.toFast = function toFast(bw, tx) {
  var i, input, prevout, coins, coin;

  for (i = 0; i < tx.inputs.length; i++) {
    input = tx.inputs[i];
    coin = this.getCoin(input);

    if (!coin) {
      bw.writeU8(0);
      continue;
    }

    bw.writeU8(1);
    coin.toWriter(bw);
  }

  return bw;
};

/**
 * Read serialized view data from a buffer
 * reader as it pertains to a transaction.
 * @private
 * @param {BufferReader} br
 * @param {TX} tx
 */

CoinView.prototype.fromFast = function fromFast(br, tx) {
  var i, input, prevout, coins, coin;

  for (i = 0; i < tx.inputs.length; i++) {
    input = tx.inputs[i];
    prevout = input.prevout;

    if (br.readU8() === 0)
      continue;

    coin = Coin.fromReader(br);
    coin.hash = prevout.hash;
    coin.index = prevout.index;

    this.addCoin(coin);
  }

  return this;
};

/**
 * Read serialized view data from a buffer
 * reader as it pertains to a transaction.
 * @param {BufferReader} br
 * @param {TX} tx
 * @returns {CoinView}
 */

CoinView.fromFast = function fromFast(br, tx) {
  return new CoinView().fromFast(br, tx);
};

/*
 * Expose
 */

module.exports = CoinView;
