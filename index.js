#!/usr/bin/env node

const axios = require('axios')
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

const wif = args['wif']
if (!wif)
  throw new Error ('Must include wif as argument --wif=<WIF>')
let amtToSendStandard = args['amt']
if (!amtToSendStandard)
  throw new Error ('Must include token amount as argument --amt=<AMOUNT_TO_SEND>')
// Do a regular send with postage?
const postage = args['postage'] && args['postage'] == 'true'
const to = args['to']
if (postage && !to)
    throw new Error ('Must include recipient address to send as argument --to=<RECIPIENT_ADDRESS>')
// Otherwise do a swap transaction
const useToken = args['send']
  if (!useToken)
    throw new Error ('Must include token ID to send as argument --send=<TOKENID_TO_SEND>')
const swapToken = args['receive']
    if (!swapToken && !postage)
      throw new Error ('Must include token ID to receive as argument --send=<TOKENID_TO_RECEIVE>')

const rateEndpoint = postage ? PayPro.postageEndpoint : PayPro.swapRateEndpoint
const priv = PrivateKey.fromString(wif);
const addr = priv.toAddress();
const cashAddress = addr.toString();

(async function(){
  try {
    console.log(`Fetching ${postage ? 'postage' : 'swap'} rates from ${rateEndpoint}...`)
    const ratesObj = (await axios.get(rateEndpoint)).data
    const exchangeAddr = bchaddr.toCashAddress(ratesObj.address)
    const useTokenRateObj = ratesObj[postage ? 'stamps' : 'tokens'].find(t => t.tokenId == useToken)
    if (!useTokenRateObj)
      throw new Error (`The token you are sending is not valid with this ${postage ? 'postage' : 'SLP swap'} provider`)
    const swapTokenRateObj = postage ? undefined : ratesObj.tokens.find(t => t.tokenId == swapToken)
    if (!swapTokenRateObj && !postage)
      throw new Error ('The token you want to receive is not offered by this SLP swap provider')
    // Convert amount to base units
    const amtToSend = amtToSendStandard * (10 ** useTokenRateObj.decimals)
    // Check that amount desired in token to be received is available
    const paidTokenRate = postage ? undefined : Number(useTokenRateObj.buy)
    const swapTokenRate = postage ? undefined : Number(swapTokenRateObj.sell)
    // console.log('tokensPaidStandard', tokensPaidStandard)
    const bchAmtPaid = postage ? undefined : amtToSendStandard * paidTokenRate
    const amountToSwapStandard = postage ? undefined : (bchAmtPaid / swapTokenRate).toFixed(swapTokenRateObj.decimals)
    if (!postage && amountToSwapStandard > swapTokenRateObj.available)
      throw new Error (`The amount of ${useTokenRateObj.symbol} you are sending exceeds the amount of ${swapTokenRateObj.symbol} available to swap`)

    console.log(`Fetching ${useTokenRateObj.symbol} UTXOs at ${cashAddress}...`)
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
      throw new Error (`Insufficient tokens to complete send. Only ${useTokenTotal * (10 ** (-1 * useTokenRateObj.decimals))} ${useTokenRateObj.symbol} available`)
    if (!postage) {
      console.log(`Swapping ${amtToSendStandard} ${useTokenRateObj.symbol} for ${amountToSwapStandard} (minus any postage cost) ${swapTokenRateObj.symbol}...`)
      console.log('Constructing SLP Swap transaction...')
    } else {
      console.log('Constructing postage transaction...')
    }
    const bnAmount = new BN(amtToSend) // Amount to send
    let tokenChange = new BN(useTokenTotal - amtToSend)
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
    if (postage) {
      // Add placeholder
      const placeHolder = new BN(1)
      sendOpReturnArray.push(BNToInt64BE(placeHolder).toString('hex'))
    }
    sendOpReturnASM = sendOpReturnArray.join(' ');
    const opReturnScript = Script.fromASM(sendOpReturnASM);

    const sighash = (Signature.SIGHASH_ALL | Signature.SIGHASH_FORKID | Signature.SIGHASH_ANYONECANPAY)

    const tx = new Transaction()
      .from(utxos)
      .addOutput(new Transaction.Output({
          script: opReturnScript,
          satoshis: 0
      }))
      .to(postage ? bchaddr.toCashAddress(to) : exchangeAddr, 546)
    // Add change output
    if (tokenChange.gt(0))
      tx.to(addr, 546)
    // Add chain dust output and sign
    tx.to(exchangeAddr, 546)
    if (!postage)
     tx.sign([priv], sighash);

    let hex = tx.toString()

    if (postage) {
      // get tx size with signatures
      const byteCount = tx.toBuffer().length + (110 * tx.inputs.length)
      // Calculate number of Stamps Needed
      const outputSum = tx.outputs.reduce(function(accumulator, output){
        return accumulator + output.satoshis
      }, 0)
      // console.log('utxos', utxos)
      const inputSum = utxos.reduce((total, input) => {
          return total + input.satoshis
      }, 0)
      const stampsNeeded = Math.ceil((outputSum + byteCount - inputSum) / ratesObj.weight)
      console.log(`Paying for ${stampsNeeded} stamps`)
      const stampsBnAmount = new BN(stampsNeeded * (useTokenRateObj.rate))
      tokenChange = tokenChange.minus(stampsBnAmount)
      if (tokenChange.lt(0))
        throw new Error ('Not enough funds available to cover postage')
      const newSendOpReturnArray = sendOpReturnArray.slice(0, 6)
      newSendOpReturnArray.push(BNToInt64BE(tokenChange).toString('hex'))
      newSendOpReturnArray.push(BNToInt64BE(stampsBnAmount).toString('hex'))
      const newSendOpReturnASM = newSendOpReturnArray.join(' ');
      const newOpReturnScript = Script.fromASM(newSendOpReturnASM);
      tx.outputs[0] = new Transaction.Output({
        script: newOpReturnScript,
        satoshis: 0
      })
      // sign
      tx.sign([priv], sighash);
      hex = tx.toString()
    }
    console.log('Sending to SLP Swap API (Postage Endpoint):', hex)
    
    // Broadcast tx
    const txIds = await PayPro.broadcastPostOfficeTx(
      hex,
      cashAddress,
      postage ? {} : { slpSwap: swapToken }
    );
    console.log(`Success! ${postage? 'Postage' : 'Swap'} transaction IDs`, txIds)
   

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
