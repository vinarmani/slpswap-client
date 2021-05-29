# slpswap-client

## Getting Started

Retrieve current rates and available token information from the following endpoint: https://api.slpswap.com/rates

## View the specification

The SLP Swap specification can be found [here](https://github.com/vinarmani/slpswap-specification/blob/main/slpswap-specification.md).

### Install on Linux
```
git clone https://github.com/vinarmani/slpswap-client.git
cd slpswap-client/
npm i
sudo npm link
```

You can now use the project from the command line with the `slpswap` command

### Command Line Usage

#### SLP Swap
```
slpswap --wif=<PRIVATE_KEY_FOR_ADDRESS_HOLDING_SLP_TOKENS> --amt=<AMOUNT_TO_SEND> --send=<TOKEN_ID_OF_TOKENS_BEING_SENT> --receive=<TOKEN_ID_OF_TOKENS_TO BE RECEIVED>
```


Sample command to send 50.5 SPICE in exchange for HONK
```
slpswap --wif=L4rnvJMVVPQP8J8xo7kT3YARYt9nwLrWQybkNXzCQnKp6Wj3WrrX --amt=50.5 --send=4de69e374a8ed21cbddd47f2338cc0f479dc58daa2bbe11cd604ca488eca0ddf --receive=7f8889682d57369ed0e32336f8b7e0ffec625a35cca183f4e81fde4e71a538a1
```

#### Regular transaction using Postage Protocol
```
slpswap --wif=<PRIVATE_KEY_FOR_ADDRESS_HOLDING_SLP_TOKENS> --amt=<AMOUNT_TO_SEND> --send=<TOKEN_ID_OF_TOKENS_BEING_SENT> --to=<SIMPLELEDGER_ADDRESS_TO_SEND_TO> --postage=true
```


Sample command to send 50.5 SPICE using Postage Protocol
```
slpswap --wif=L4rnvJMVVPQP8J8xo7kT3YARYt9nwLrWQybkNXzCQnKp6Wj3WrrX --amt=50.5 --send=4de69e374a8ed21cbddd47f2338cc0f479dc58daa2bbe11cd604ca488eca0ddf --to=simpleledger:qzhfgts6y6pnyhrfxas9yy7rheffggcjuc3u67s8ug --postage=true
```

