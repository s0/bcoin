/*!
 * coinview.js - coin viewpoint object for bcoin
 * Copyright (c) 2014-2017, Christopher Jeffrey (MIT License).
 * https://github.com/bcoin-org/bcoin
 */

'use strict';

var co = require('../utils/co');
var Coins = require('./coins');
var UndoCoins = require('./undocoins');
var CoinEntry = require('./coinentry');

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

  this.map = Object.create(null);
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
 * @param {Hash} hash
 * @param {Coins} coins
 */

CoinView.prototype.add = function add(hash, coins) {
  this.map[hash] = coins;
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
  return this.add(tx.hash('hex'), coins);
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

  return this.add(tx.hash('hex'), coins);
};

/**
 * Add an entry to the collection.
 * @param {Outpoint} prevout
 * @param {CoinEntry} coin
 * @returns {Coins|null}
 */

CoinView.prototype.addEntry = function addEntry(prevout, coin) {
  var coins = this.get(prevout.hash);

  if (!coins) {
    coins = new Coins();
    this.add(prevout.hash, coins);
  }

  if (coin.output.script.isUnspendable())
    return;

  if (!coins.has(prevout.index))
    coins.add(prevout.index, coin);

  return coins;
};

/**
 * Add a coin to the collection.
 * @param {Coin} coin
 */

CoinView.prototype.addCoin = function addCoin(coin) {
  var coins = this.get(coin.hash);

  if (!coins) {
    coins = new Coins();
    this.add(coin.hash, coins);
  }

  if (coin.script.isUnspendable())
    return;

  if (!coins.has(coin.index))
    coins.addCoin(coin);

  return coins;
};

/**
 * Add an output to the collection.
 * @param {Outpoint} prevout
 * @param {Output} output
 */

CoinView.prototype.addOutput = function addOutput(prevout, output) {
  var coins = this.get(prevout.hash);

  if (!coins) {
    coins = new Coins();
    this.add(prevout.hash, coins);
  }

  if (output.script.isUnspendable())
    return;

  if (!coins.has(prevout.index))
    coins.addOutput(prevout.index, output);
};

/**
 * Spend an output.
 * @param {Outpoint} prevout
 * @returns {Boolean}
 */

CoinView.prototype.spendOutput = function spendOutput(prevout) {
  var coins = this.get(prevout.hash);

  if (!coins)
    return false;

  return this.spendFrom(coins, prevout.index);
};

/**
 * Remove an output.
 * @param {Outpoint} prevout
 * @returns {Boolean}
 */

CoinView.prototype.removeOutput = function removeOutput(prevout) {
  var coins = this.get(prevout.hash);

  if (!coins)
    return false;

  return coins.remove(prevout.index);
};

/**
 * Spend a coin from coins object.
 * @param {Coins} coins
 * @param {Number} index
 * @returns {Boolean}
 */

CoinView.prototype.spendFrom = function spendFrom(coins, index) {
  var coin = coins.spend(index);

  if (!coin)
    return false;

  this.undo.push(coin);

  return true;
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
 * Get a single coin by input.
 * @param {Input} input
 * @returns {Coin}
 */

CoinView.prototype.getCoin = function getCoin(input) {
  var coins = this.get(input.prevout.hash);

  if (!coins)
    return;

  return coins.getCoin(input.prevout);
};

/**
 * Get a single output by input.
 * @param {Input} input
 * @returns {Output}
 */

CoinView.prototype.getOutput = function getOutput(input) {
  var coins = this.get(input.prevout.hash);

  if (!coins)
    return;

  return coins.getOutput(input.prevout.index);
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
  var coin = this.getEntry(input);

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
  var coin = this.getEntry(input);

  if (!coin)
    return false;

  return coin.coinbase;
};

/**
 * Retrieve coins from database.
 * @method
 * @param {ChainDB} db
 * @param {Input} input
 * @returns {Promise} - Returns {@link Coins}.
 */

CoinView.prototype.readCoin = co(function* readCoin(db, input) {
  var coin = this.hasEntry(input);
  var prevout = input.prevout;

  if (!coin) {
    coin = yield db.readCoin(prevout);

    if (!coin)
      return;

    return this.addEntry(prevout, coin);
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
 * Get coinview keys.
 * @returns {String[]}
 */

CoinView.prototype.keys = function keys() {
  return Object.keys(this.map);
};

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
    coin = this.getEntry(input);

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
  var i, input, coin;

  for (i = 0; i < tx.inputs.length; i++) {
    input = tx.inputs[i];
    coin = this.getEntry(input);

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
  var i, input, prevout, coin;

  for (i = 0; i < tx.inputs.length; i++) {
    input = tx.inputs[i];
    prevout = input.prevout;

    if (br.readU8() === 0)
      continue;

    coin = CoinEntry.fromReader(br);

    this.addEntry(prevout, coin);
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
