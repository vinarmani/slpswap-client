const axios = require('axios')
const PaymentProtocol = require('bitcore-payment-protocol')
const Bitcore = require('bitcore-lib-cash')
const bchaddr = require('bchaddrjs-slp')

const postageEndpoint = 'https://api.slpswap.com/postage'

var PayPro = {}

PayPro.postageEndpoint = 'https://api.slpswap.com/postage'
PayPro.swapRateEndpoint = 'https://api.slpswap.com/rates'

PayPro.broadcastPostOfficeTx = async (hex, tokenChangeAddress, merchantData= {}) => {
    if (typeof hex == "string") {
      hex = [hex];
    }
    const hexBufArray = hex.map(h => Buffer.from(h, "hex"));
    // send the postage transaction
    let payment = new PaymentProtocol().makePayment();
    merchantData.returnRawTx = false;
    const merchantDataJson = JSON.stringify(merchantData);
    payment.set("merchant_data", Buffer.from(merchantDataJson, "utf-8"));
    payment.set("transactions", hexBufArray);
  
    // calculate refund script pubkey from change address
    const changeAddr = Bitcore.Address.fromString(tokenChangeAddress);
    const refundScriptPubkey = Bitcore.Script.fromAddress(changeAddr).toBuffer();
  
    // define the refund outputs
    let refundOutputs = [];
    let refundOutput = new PaymentProtocol().makeOutput();
    refundOutput.set("amount", 0);
    refundOutput.set("script", refundScriptPubkey);
    refundOutputs.push(refundOutput.message);
    payment.set("refund_to", refundOutputs);
    payment.set("memo", "");
  
    // Send to Post Office?
    const paymentUrl = PayPro.postageEndpoint;
  
    // serialize and send
    const rawbody = payment.serialize();
    const headers = {
      Accept: "application/simpleledger-paymentack",
      "Content-Type": merchantData.slpSwap ? "application/simpleledger-swap" : "application/simpleledger-payment",
      "Content-Transfer-Encoding": "binary"
    };

    const res = await axios({
        method: 'post',
        url: paymentUrl,
        data: rawbody,
        headers: headers,
        responseType: 'arraybuffer'
    })

    // console.log('res', res.data)
    var body = PaymentProtocol.PaymentACK.decode(res.data);
    var ack = new PaymentProtocol().makePaymentACK(body);
    var serializedPayment = ack.get('payment');
    var memo = ack.get('memo');
    var decodedPayment = PaymentProtocol.Payment.decode(serializedPayment);
    var ackPayment = new PaymentProtocol().makePayment(decodedPayment);
    const transactions = ackPayment.get('transactions')
    const txIds = transactions.map(t => {
      const tx = new Bitcore.Transaction(t.toHex())
      return tx.hash
    })
    return txIds;
};

module.exports = PayPro;