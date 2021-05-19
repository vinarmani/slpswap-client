const { GrpcClient } = require('grpc-bchrpc-node');
const grpc = new GrpcClient({ url: 'bchd.fountainhead.cash:443' });
const reverse = require('buffer-reverse');

function BCHD () {}

BCHD.getUtxosByAddress = async function (address) {
    const utxos = await grpc.getAddressUtxos({
        address: address,
        includeMempool: true,
        includeTokenMetadata: true,
    })
    const outs = utxos.toObject().outputsList.map(out => {
        const outHashBuffer = Buffer.from(out.outpoint.hash, 'base64')
        out.outpoint.hash = reverse(outHashBuffer).toString('hex')
        const pubKeyScriptBuf = Buffer.from(out.pubkeyScript, 'base64')
        out.pubkeyScript = pubKeyScriptBuf.toString('hex')
        return out
    })
    return outs
}

BCHD.getUtxo = async function (txhash, vout, includeTokenMetadata = true) {
    const utxoPb = await grpc.getUnspentOutput({
        hash: txhash,
        vout: vout,
        reversedHashOrder: true,
        includeMempool: true,
        includeTokenMetadata: includeTokenMetadata,
    })
    const utxo = utxoPb.toObject()
    if (utxo.outpoint) {
        const outHashBuffer = Buffer.from(utxo.outpoint.hash, 'base64')
        utxo.outpoint.hash = reverse(outHashBuffer).toString('hex')
        const pubKeyScriptBuf = Buffer.from(utxo.pubkeyScript, 'base64')
        utxo.pubkeyScript = pubKeyScriptBuf.toString('hex')
        const tx = await BCHD.getTransaction(utxo.outpoint.hash)

        // Get SLP Info
        let slpToken = tx.transaction.outputsList[utxo.outpoint.index].slpToken
        if (slpToken) {
            utxo.tokenMetadata = tx.tokenMetadata
            const tokenIdBuf = Buffer.from(slpToken.tokenId, 'base64')
            slpToken.tokenId = tokenIdBuf.toString('hex')
            // Set tokenMetadata
            const tokenTxType = `type${slpToken.tokenType}`
            utxo.tokenMetadata = {
                ...utxo.tokenMetadata,
                ...utxo.tokenMetadata[tokenTxType]
            }
            utxo.tokenMetadata.tokenId = slpToken.tokenId
            utxo.tokenMetadata.tokenTicker = utxo.tokenMetadata.v1Fungible.tokenTicker
            utxo.tokenMetadata.tokenName = utxo.tokenMetadata.v1Fungible.tokenName
            utxo.tokenMetadata.tokenDocumentUrl = utxo.tokenMetadata.v1Fungible.tokenDocumentUrl
            utxo.tokenMetadata.tokenDocumentHash = utxo.tokenMetadata.v1Fungible.tokenDocumentHash
            utxo.slpToken = slpToken
            delete utxo.tokenMetadata[tokenTxType]
            delete utxo.tokenMetadata.tokenType
            delete utxo.tokenMetadata.v1Fungible
            delete utxo.tokenMetadata.v1Nft1Group
            delete utxo.tokenMetadata.v1Nft1Child
        }
    }
    return utxo
}

BCHD.getTransaction = async function (txhash) {
    const txPb = await grpc.getTransaction({
        hash: txhash,
        reversedHashOrder: true,
        includeTokenMetadata: true
    })
    const tx = txPb.toObject()
    return tx
}

BCHD.checkSlpTransaction = async function (txhash) {
    const slpCheckPb = await grpc.checkSlpTransaction({
        txnHex: txhash
    })
    const res = slpCheckPb.toObject()
    return res
}

BCHD.parseSlpOpReturn = async function (scriptBuf) {
    const parsedOpReturnPb = await grpc.getParsedSlpScript(scriptBuf)
    const res = parsedOpReturnPb.toObject()
    if (res.tokenId) {
        const tokenIdBuf = Buffer.from(res.tokenId, 'base64')
        res.tokenId = tokenIdBuf.toString('hex')
        if (res.slpAction == 6)
            res.sendOutputs = res.v1Send.amountsList
        else if (res.slpAction == 5)
            res.sendOutputs = res.v1Mint.amountsList
    }
    return res
}

BCHD.broadcastTransaction = async function (rawTxHex, checkValidSlp = true) {
    const res = await grpc.submitTransaction({
        txnHex: rawTxHex,
        skipSlpValidityChecks: !checkValidSlp
    });
    let resObj = res.toObject();
    if (resObj.hash) {
        const outHashBuf = Buffer.from(resObj.hash, 'base64')
        resObj.hash = reverse(outHashBuf).toString('hex')
    }
    return resObj;
}

module.exports = BCHD;