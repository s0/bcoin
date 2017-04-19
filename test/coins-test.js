'use strict';

var assert = require('assert');
var util = require('../lib/utils/util');
var encoding = require('../lib/utils/encoding');
var crypto = require('../lib/crypto/crypto');
var consensus = require('../lib/protocol/consensus');
var Network = require('../lib/protocol/network');
var TX = require('../lib/primitives/tx');
var Block = require('../lib/primitives/block');
var Coin = require('../lib/primitives/coin');
var Output = require('../lib/primitives/output');
var Script = require('../lib/script/script');
var Witness = require('../lib/script/witness');
var Input = require('../lib/primitives/input');
var Outpoint = require('../lib/primitives/outpoint');
var CoinView = require('../lib/coins/coinview');
var Coins = require('../lib/coins/coins');
var CoinEntry = require('../lib/coins/coinentry');
var UndoCoins = require('../lib/coins/undocoins');
var StaticWriter = require('../lib/utils/staticwriter');
var BufferReader = require('../lib/utils/reader');
var KeyRing = require('../lib/primitives/keyring');
var parseTX = require('./util/common').parseTX;
var opcodes = Script.opcodes;

var data = parseTX('data/tx1.hex');
var tx1 = data.tx;

function reserialize(coin) {
  var raw = coin.toRaw();
  var entry = CoinEntry.fromRaw(raw);
  entry.raw = null;
  return CoinEntry.fromRaw(entry.toRaw());
}

function deepCoinsEqual(a, b) {
  assert.strictEqual(a.version, b.version);
  assert.strictEqual(a.height, b.height);
  assert.strictEqual(a.coinbase, b.coinbase);
  assert.deepStrictEqual(a.raw, b.raw);
}

describe('Coins', function() {
  it('should instantiate coinview from tx', function() {
    var hash = tx1.hash('hex');
    var view = new CoinView();
    var prevout = new Outpoint(hash, 0);
    var input = Input.fromOutpoint(prevout);
    var coins, entry, output;

    view.addTX(tx1, 1);

    coins = view.get(hash);
    assert.equal(coins.outputs.length, tx1.outputs.length);

    entry = coins.get(0);
    assert(entry);
    assert(!entry.spent);

    assert.equal(entry.version, 1);
    assert.equal(entry.height, 1);
    assert.equal(entry.coinbase, false);
    assert.equal(entry.raw, null);
    assert(entry.output instanceof Output);
    assert.equal(entry.spent, false);

    output = view.getOutput(input);
    assert(output);

    deepCoinsEqual(entry, reserialize(entry));
  });

  it('should spend an output', function() {
    var hash = tx1.hash('hex');
    var view = new CoinView();
    var coins, entry, length;

    view.addTX(tx1, 1);

    coins = view.get(hash);
    assert(coins);
    length = coins.length();

    view.spendOutput(new Outpoint(hash, 0));

    coins = view.get(hash);
    assert(coins);

    entry = coins.get(0);
    assert(entry);
    assert(entry.spent);

    deepCoinsEqual(entry, reserialize(entry));
    assert.strictEqual(coins.length(), length);

    assert.equal(view.undo.items.length, 1);
  });

  it('should handle coin view', function() {
    var hash = tx1.hash('hex');
    var view = new CoinView();
    var i, tx, size, bw, br;
    var raw, res, prev, coins;

    for (i = 1; i < data.txs.length; i++) {
      tx = data.txs[i];
      view.addTX(tx, 1);
    }

    size = view.getFastSize(tx1);
    bw = new StaticWriter(size);
    raw = view.toFast(bw, tx1).render();
    br = new BufferReader(raw);
    res = CoinView.fromFast(br, tx1);

    prev = tx1.inputs[0].prevout;
    coins = res.get(prev.hash);

    assert.strictEqual(coins.length(), 2);
    assert.strictEqual(coins.get(0), null);
    deepCoinsEqual(coins.get(1), reserialize(coins.get(1)));
  });
});
