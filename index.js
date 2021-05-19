#!/usr/bin/env node

const PayPro = require('./lib/Paypro');
const BCHD = require('./lib/BCHD');
const BN = require('bignumber.js')
const bchaddr = require('bchaddrjs-slp')
const Bitcore = require('bitcore-lib-cash')
const PrivateKey = Bitcore.PrivateKey
const Address = Bitcore.Address
const Transaction = Bitcore.Transaction
const UnspentOutput = Transaction.UnspentOutput
const Signature = Bitcore.crypto.Signature
const Script = Bitcore.Script

const args = require('minimist')(process.argv.slice(2))

const BNToInt64BE = function (bn) {
  if (! bn.isInteger()) {
    throw new Error('bn not an integer');
  }

  if (! bn.isPositive()) {
    throw new Error('bn not positive integer');
  }

  const h = bn.toString(16)
  if (h.length > 16) {
    throw new Error('bn outside of range');
  }

  return Buffer.from(h.padStart(16, '0'), 'hex');
}

const wif = args['wif'] // 'L54moYHgnW82HWr5f1yvmYYbXRnEktz69929KcnNJ7YxNK7AWcXT'
if (!wif)
  throw new Error ('Must include wif as argument --wif=<WIF>')
const amtToSend = args['amt']
if (!amtToSend)
  throw new Error ('Must include token amount as argument --amt=<AMOUNT_TO_SEND>')
const useToken = args['send']
  if (!useToken)
    throw new Error ('Must include token ID to send as argument --send=<TOKENID_TO_SEND>')
const swapToken = args['receive']
    if (!swapToken)
      throw new Error ('Must include token ID to receive as argument --send=<TOKENID_TO_RECEIVE>')
// const swapToken = '4de69e374a8ed21cbddd47f2338cc0f479dc58daa2bbe11cd604ca488eca0ddf' // SPICE
// const useToken = '7f8889682d57369ed0e32336f8b7e0ffec625a35cca183f4e81fde4e71a538a1' // HONK
// const swapToken = '9fc89d6b7d5be2eac0b3787c5b8236bca5de641b5bafafc8f450727b63615c11' // USDT
const exchangeAddr = bchaddr.toCashAddress('simpleledger:qpren52c6y98kt9eenjhtqe437dkwlyfcqj4j3dnmn')

const priv = PrivateKey.fromString(wif); // bitcoincash:qzhfgts6y6pnyhrfxas9yy7rheffggcjuca83998zk, simpleledger:qzhfgts6y6pnyhrfxas9yy7rheffggcjuc3u67s8ug
const addr = priv.toAddress();
const cashAddress = addr.toString();

(async function(){
    try {
    console.log(`Fetching UTXOs at ${cashAddress} for tokenID: ${useToken}...`)
    const rawUtxos = await BCHD.getUtxosByAddress(cashAddress)
    const utxos = []
    let useTokenTotal = 0
    for (let i = 0; i < rawUtxos.length; i++) {
        const outpoint = rawUtxos[i].outpoint
        const fullUtxo = await BCHD.getUtxo(outpoint.hash, outpoint.index)
        if (fullUtxo.slpToken && fullUtxo.slpToken.tokenId == useToken) {
          const scriptPubKey = Script.fromHex(fullUtxo.pubkeyScript)
          const utxo = new UnspentOutput({
            "txid" : fullUtxo.outpoint.hash,
            "vout" : fullUtxo.outpoint.index,
            "address" : scriptPubKey.toAddress(),
            "scriptPubKey" : scriptPubKey,
            "satoshis" : fullUtxo.value
          });
          utxos.push(utxo)
          useTokenTotal += parseInt(fullUtxo.slpToken.amount)
        }
    }
    // console.log(utxos);

    // Create Payment Transaction
    if (amtToSend > useTokenTotal)
      throw new Error (`Insufficient tokens to complete send. Only ${useTokenTotal} units available`)
    console.log('Constructing SLP Swap transaction...')
    const bnAmount = new BN(amtToSend) // Amount to send
    const tokenChange = new BN(useTokenTotal - amtToSend)
    const sendOpReturnArray = [
        'OP_RETURN',
        '534c5000',
        '01',
        '53454e44',
        useToken,
        BNToInt64BE(bnAmount).toString('hex'), // Amount to exchange
    ];
    // Add change output to OP_RETURN
    if (tokenChange.gt(0))
      sendOpReturnArray.push(BNToInt64BE(tokenChange).toString('hex'))
    sendOpReturnASM = sendOpReturnArray.join(' ');
    const opReturnScript = Script.fromASM(sendOpReturnASM);

    const sighash = (Signature.SIGHASH_ALL | Signature.SIGHASH_FORKID | Signature.SIGHASH_ANYONECANPAY)

    const tx = new Transaction()
      .from(utxos)
      .addOutput(new Transaction.Output({
          script: opReturnScript,
          satoshis: 0
      }))
      .to(exchangeAddr, 546)
    // Add change output
    if (tokenChange.gt(0))
      tx.to(addr, 546)
    // Add chain dust output and sign
    tx.to(exchangeAddr, 546)
      .sign([priv], sighash);

    const hex = tx.toString()
    // console.log(tx.toObject())
    console.log('Sending to SLP Swap API:', hex)
    
    // Broadcast tx
    const txIds = await PayPro.broadcastPostOfficeTx(
      hex,
      cashAddress,
      {
        slpSwap: swapToken
      }
    );
    console.log('Success! Swap transaction IDs', txIds)
   

  } catch (e) {
    if (e.isAxiosError) {
      console.log('API Error', {
        status: e.response.status,
        message: e.response.data.toString('utf-8')
      })
    }
    else
      console.error(e)
  }

})();
