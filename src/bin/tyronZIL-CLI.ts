/*
    TyronZIL-js: Decentralized identity client for the Zilliqa blockchain platform
    Copyright (C) 2020 Julio Cesar Cabrapan Duarte

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.
*/

import LogColors from './log-colors';
import * as readline from 'readline-sync';
import * as Crypto from '@zilliqa-js/crypto';
import DidCreate from '../lib/decentralized-identity/sidetree-protocol/did-operations/did-create';
import { CliInputModel } from './cli-input-model';
import { NetworkNamespace } from '../lib/decentralized-identity/tyronZIL-schemes/did-scheme';
import { LongFormDidInput, TyronZILUrlScheme } from '../lib/decentralized-identity/tyronZIL-schemes/did-url-scheme';
import DidDoc, {ResolutionInput, Accept, ResolutionResult} from '../lib/decentralized-identity/did-document';
import { Cryptography } from '../lib/decentralized-identity/util/did-keys';
import Multihash from '@decentralized-identity/sidetree/dist/lib/core/versions/latest/Multihash';
import Encoder from '@decentralized-identity/sidetree/dist/lib/core/versions/latest/Encoder';
import SidetreeError from '@decentralized-identity/sidetree/dist/lib/common/SidetreeError';
import ErrorCode from '../lib/decentralized-identity/util/ErrorCode';
import { PatchAction, PatchModel, DocumentModel } from '../lib/decentralized-identity/sidetree-protocol/models/patch-model';
import TyronTransaction, { TransitionTag, DeployedContract } from '../lib/blockchain/tyron-transaction';
import { ContractInit } from '../lib/blockchain/tyron-contract';
import { Sidetree, SuffixDataModel } from '../lib/decentralized-identity/sidetree-protocol/sidetree';
import DeltaModel from '@decentralized-identity/sidetree/dist/lib/core/versions/latest/models/DeltaModel';
import Util, { PrivateKeys } from './util';
import DidUpdate, { UpdateOperationInput } from '../lib/decentralized-identity/sidetree-protocol/did-operations/did-update';
import DidState from '../lib/decentralized-identity/did-state';
import OperationType from '@decentralized-identity/sidetree/dist/lib/core/enums/OperationType';

//import DidRecover, { RecoverOperationInput } from '../lib/sidetree/did-operations/did-recover';
//import DidDeactivate, { DeactivateOperationInput } from '../lib/sidetree/did-operations/did-deactivate';

/** Handles the command-line interface DID operations */
export default class TyronCLI {
    /** Gets network choice from the user */
    private static network(): NetworkNamespace {
        const network = readline.question(LogColors.green(`On which Zilliqa network would you like to operate, mainnet(m) or testnet(t)?`) + ` - [m/t] - Defaults to testnet - ` + LogColors.lightBlue(`Your answer: `));
        // Defaults to testnet
        let NETWORK;
        switch(network.toLowerCase()) {
            case 'm':
                NETWORK = NetworkNamespace.Mainnet;
                break;
            default:
                // Defaults to testnet
                NETWORK = NetworkNamespace.Testnet;
                break;
        }
        return NETWORK;
    }

    /** Initializes the client account */
    private static async clientInit(): Promise<Account> {
        const client_privateKey = readline.question(LogColors.green(`What is the client's private key? - `) + LogColors.lightBlue(`Your answer: `));
        const CLIENT_ADDR = Crypto.getAddressFromPrivateKey(client_privateKey);
        const CLIENT: Account = {
            addr: CLIENT_ADDR,
            privateKey: client_privateKey,
        };
        return CLIENT;
    }

    /***            ****            ***/

    /** Handles the `create` subcommand */
    public static async handleCreate(): Promise<void> {
        const NETWORK = this.network();
        await this.clientInit()
        .then(async client => {
            const user_privateKey = readline.question(LogColors.green(`As the user, you're the owner of your tyron-smart-contract! Which private key do you choose to have that power? - `) + LogColors.lightBlue(`Your answer: `));
            const CONTRACT_OWNER = Crypto.getAddressFromPrivateKey(user_privateKey);
            const USER: Account = {
                addr: CONTRACT_OWNER,
                privateKey: user_privateKey
            };

            const ACCOUNTS = {
                client: client,
                user: USER
            };
            return ACCOUNTS;
        })
        .then(async accounts => {
            // Adds public keys and service endpoints:
            const PUBLIC_KEYS = await Util.InputKeys();
            const SERVICE = await Util.InputService();

            const CLI_INPUT: CliInputModel = {
                network: NETWORK,
                publicKeyInput: PUBLIC_KEYS,
                service: SERVICE
            }

            /** Executes the DID-create operation */
            const DID_EXECUTED = await DidCreate.execute(CLI_INPUT);

            /** tyronZIL DID instance with the proper DID-scheme */
            const DID_tyronZIL = DID_EXECUTED.didScheme.did_tyronZIL;
            
            console.log(LogColors.yellow(`Your decentralized identity on Zilliqa is: `) + LogColors.brightGreen(`${DID_tyronZIL}`)); 
            
            /***            ****            ***/
            
            // To save the private keys:
            const PRIVATE_KEYS: PrivateKeys = {
                privateKeys: DID_EXECUTED.privateKey,
                updatePrivateKey: Encoder.encode(Buffer.from(JSON.stringify(DID_EXECUTED.updatePrivateKey))),
                recoveryPrivateKey: Encoder.encode(Buffer.from(JSON.stringify(DID_EXECUTED.recoveryPrivateKey))),
            };
            await Util.savePrivateKeys(DID_tyronZIL, PRIVATE_KEYS);
            
            /***            ****            ***/
            
            /** To generate the Sidetree Long-Form DID */
            const LONG_DID_INPUT: LongFormDidInput = {
                    schemeInput: DID_EXECUTED.didScheme,
                    suffixData: DID_EXECUTED.suffixData,
                    delta: DID_EXECUTED.delta
            }
            const LONG_FORM_DID = await TyronZILUrlScheme.longFormDid(LONG_DID_INPUT);
            const LONG_DID_tyronZIL = LONG_FORM_DID.longFormDid;

            console.log(LogColors.yellow(`In case you want to submit the transaction at a later stage, your Sidetree Long-Form DID is: `) + LogColors.brightYellow(`${LONG_DID_tyronZIL}`));
            
            return {
                accounts: accounts,
                operation: DID_EXECUTED
            };
        })
        .then(async TYRON_CLI => {
            /** Asks if the user wants to write their tyronZIL DID on Zilliqa */
            const write_did = readline.question(LogColors.green(`Would you like to write your tyronZIL DID on the Zilliqa platform now?`) + ` - [y/n] - Defaults to yes - ` + LogColors.lightBlue(`Your answer: `));
            switch (write_did.toLowerCase()) {
                case "n":
                    console.log(LogColors.green(`Then, that's all for now. Enjoy your decentralized identity!`));
                    return;
                default:
                    break;
            }

            const SUFFIX_OBJECT = await Sidetree.suffixModel(TYRON_CLI.operation.suffixData) as SuffixDataModel;
            const DELTA_OBJECT = await Sidetree.deltaModel(TYRON_CLI.operation.delta) as DeltaModel;
            
            const DOCUMENT = await Sidetree.docFromDelta(TYRON_CLI.operation.type, TYRON_CLI.operation.delta) as DocumentModel;
            console.log(JSON.stringify(DOCUMENT, null, 2));
            const DOC_BUFFER = Buffer.from(JSON.stringify(DOCUMENT));
            const ENCODED_DOCUMENT = Encoder.encode(DOC_BUFFER);  
            
            const PARAMS = await TyronTransaction.create(
                TYRON_CLI.operation.didScheme.did_tyronZIL,
                ENCODED_DOCUMENT,       
                DELTA_OBJECT.updateCommitment,
                SUFFIX_OBJECT.recovery_commitment
            );

            const CONTRACT_INIT: ContractInit = {
                tyron_init: "0x75d8297b8bd2e35de1c17e19d2c13504de623793",
                contract_owner: TYRON_CLI.accounts.user.addr,
                client_addr: TYRON_CLI.accounts.client.addr,
                tyron_stake: 100000000000000        // e.g. 100 ZIL
            };

            const gas_limit = readline.question(LogColors.green(`What is the gas limit? - `) + LogColors.lightBlue(`Your answer: `));
            
            console.log(LogColors.brightGreen(`Initializing your tyron-smart-contract...`));
            
            const INITIALIZE = await TyronTransaction.initialize(
                NETWORK,
                CONTRACT_INIT,
                TYRON_CLI.accounts.client.privateKey,
                TYRON_CLI.accounts.user.privateKey,
                Number(gas_limit),
            );
            
            const INIT = INITIALIZE as TyronTransaction;
            const version = readline.question(LogColors.green(`What version of the tyron-smart-contract would you like to deploy? - `) + LogColors.lightBlue(`Your answer: `));
            
            // The user deploys their tyron-smart-contract and calls the ContractInit transition
            console.log(LogColors.brightGreen(`Deploying...`));
            const DEPLOYED_CONTRACT = await TyronTransaction.deploy(INIT, version);
            
            const TYRON_ADDR = (DEPLOYED_CONTRACT as DeployedContract).contract.address;
            
            const TAG = TransitionTag.Create;
    
            await TyronTransaction.submit(INIT, TYRON_ADDR!, TAG, PARAMS);
        })
        .catch(error => console.error(error))            
    }

    /***            ****            ****/

    /** Resolves the tyronZIL DID and saves it */
    public static async handleResolve(): Promise<void> {
        const NETWORK = this.network();
        const DID = readline.question(LogColors.green(`Which tyronZIL DID would you like to resolve? - `) + LogColors.lightBlue(`Your answer: `));
        /** Asks for the user's `tyron address` */
        const tyronAddr = readline.question(LogColors.green(`What is the address of the user's tyron-smart-contract - `) + LogColors.lightBlue(`Your answer: `));
        
        /** Whether to resolve the DID as a document or resolution result */
        const RESOLUTION_CHOICE = readline.question(LogColors.green(`Would you like to resolve your DID as a document(1) or as a resolution result(2)? `) + `- [1/2] - Defaults to document - ` + LogColors.lightBlue(`Your answer: `));
        
        let ACCEPT;
        switch (RESOLUTION_CHOICE) {
            case "1":
                ACCEPT = Accept.contentType                
                break;
            case "2":
                ACCEPT = Accept.Result
                break;
            default:
                ACCEPT = Accept.contentType
                break;
        }

        const RESOLUTION_INPUT: ResolutionInput = {
            did: DID,
            metadata : {
                accept: ACCEPT
            }
        }
        console.log(LogColors.brightGreen(`Resolving your request...`));

        /** Resolves the tyronZIL DID */        
        await DidDoc.resolution(NETWORK, tyronAddr, RESOLUTION_INPUT)
        .then(async did_resolved => {
            const DID_RESOLVED = did_resolved as ResolutionResult|DidDoc;
            // Saves the DID-document
            await DidDoc.write(DID, DID_RESOLVED);
        })
        .catch(err => console.error(err))
    }

    /***            ****            ****/

    /** Handles the update subcommand */
    public static async handleUpdate(): Promise<void> {
        console.log(LogColors.brightGreen(`To update your tyronZIL DID, let's fetch its current state from the Zilliqa blockchain platform!`));
        const NETWORK = this.network();
        /** Asks for the user's `tyron address` */
        const tyronAddr = readline.question(LogColors.green(`What is the address of the user's tyron-smart-contract? - `) + LogColors.lightBlue(`Your answer: `));
        
        await DidState.fetch(NETWORK, tyronAddr)
        .then(async did_state => {
            const DID_STATE = did_state as DidState;
            if(DID_STATE.status === OperationType.Deactivate) {
                throw new SidetreeError(ErrorCode.DidDeactivated) }
            const UPDATE_COMMITMENT = DID_STATE.updateCommitment;
            const INPUT_PRIVATE_KEY = readline.question(LogColors.brightGreen(`DID state retrieved - Provide your update private key - `) + LogColors.lightBlue(`Your answer: `));
            const UPDATE_PRIVATE_KEY = await JSON.parse(Encoder.decodeAsString(INPUT_PRIVATE_KEY));
            const UPDATE_KEY = Cryptography.getPublicKey(UPDATE_PRIVATE_KEY);
            const COMMITMENT = Multihash.canonicalizeThenHashThenEncode(UPDATE_KEY);
            if (UPDATE_COMMITMENT === COMMITMENT) {
                console.log(LogColors.brightGreen(`Sidetree public-key commitment matched! You will be able to update your tyronZIL DID`));
                return {
                    state: DID_STATE,
                    updatePrivateKey: UPDATE_PRIVATE_KEY,
                    updateCommitment: UPDATE_COMMITMENT
                }
            } else {
                throw new SidetreeError(ErrorCode.CouldNotVerifyKey)
            }
        })
        .then(async TYRON_CLI => {
            const patches_amount = readline.question(LogColors.green(`How many patches would you like to make? - `) + LogColors.lightBlue(`Your answer: `));
            const PATCHES = [];
            for(let i=0, t= Number(patches_amount); i<t; ++i) {
                // Asks for the specific patch action to update the DID:
                const action = readline.question(LogColors.green(`You may choose one of the following actions to update your DID:
                'add-keys'(1),
                'remove-keys'(2),
                'add-services'(3),
                'remove-services'(4)`)
                + ` - [1/2/3/4] - ` + LogColors.lightBlue(`Your answer: `));
        
                const ID = [];
                let PUBLIC_KEYS;
                let SERVICE;
                let PATCH_ACTION;
                switch (action) {
                    case '1':
                        PATCH_ACTION = PatchAction.AddKeys;
                        PUBLIC_KEYS = await Util.InputKeys();
                        break;
                    case '2':
                        PATCH_ACTION = PatchAction.RemoveKeys;
                        { const KEY_ID = readline.question(LogColors.green(`Provide the ID of the key that you would like to remove - `) + LogColors.lightBlue(`Your answer: `));
                        ID.push(KEY_ID)
                        }
                        break;
                    case '3':
                        PATCH_ACTION = PatchAction.AddServices;
                        SERVICE = await Util.InputService();
                        break;
                    case '4':
                        PATCH_ACTION = PatchAction.RemoveServices;
                        { const SERVICE_ID = readline.question(LogColors.green(`Provide the ID of the service that you would like to remove - `) + LogColors.lightBlue(`Your answer: `));
                        ID.push(SERVICE_ID)
                        }
                        break;
                    default:
                        throw new SidetreeError(ErrorCode.IncorrectPatchAction);
                }
            
                const PATCH: PatchModel = {
                    action: PATCH_ACTION,
                    keyInput: PUBLIC_KEYS,
                    service_endpoints: SERVICE,
                    ids: ID,
                    public_keys: ID
                }
                PATCHES.push(PATCH)
            }            
            const UPDATE_INPUT: UpdateOperationInput = {
                state: TYRON_CLI.state,
                updatePrivateKey: TYRON_CLI.updatePrivateKey,
                patches: PATCHES            
            };

            const DID_EXECUTED = await DidUpdate.execute(UPDATE_INPUT) as DidUpdate;
            if(DID_EXECUTED !== undefined) {
                console.log(LogColors.brightGreen(`Success! Your Sidetree update request was accepted`));
            } else {
                console.error(LogColors.red("Wrong choice. Try again."))
            }
            
            /***            ****            ***/

            // To save the private keys:
            const PRIVATE_KEYS: PrivateKeys = {
                privateKeys: DID_EXECUTED.privateKey,
                updatePrivateKey: Encoder.encode(Buffer.from(JSON.stringify(DID_EXECUTED.updatePrivateKey))),
            };
            await Util.savePrivateKeys(TYRON_CLI.state.did_tyronZIL, PRIVATE_KEYS)

            /***            ****            ***/

            console.log(LogColors.brightGreen(`Next, let's save your DID update on the Zilliqa blockchain platform, so it stays immutable!`));
            
            const DOCUMENT = await Sidetree.docFromDelta(DID_EXECUTED.type, DID_EXECUTED.delta, TYRON_CLI.state.document) as DocumentModel;
            const DOC_BUFFER = Buffer.from(JSON.stringify(DOCUMENT));
            const ENCODED_DOCUMENT = Encoder.encode(DOC_BUFFER);
            
            const PARAMS = await TyronTransaction.update(
                TYRON_CLI.updateCommitment,
                ENCODED_DOCUMENT,
                DID_EXECUTED.newUpdateCommitment
            );

            const CONTRACT_INIT: ContractInit = {
                tyron_init: "0x75d8297b8bd2e35de1c17e19d2c13504de623793",
                contract_owner: "0x0DBA45B0E1Cce172D84450Fc60e831F0A455d91d",
                client_addr: "0xccDdFAD074cd608B6B43e14eb3440240f5bFf087",
                tyron_stake: 100000000000000        // e.g. 100 ZIL
            };

            const gas_limit = readline.question(LogColors.green(`What is the gas limit? - `) + LogColors.lightBlue(`Your answer: `));
            
            const INITIALIZE = await TyronTransaction.initialize(
                NETWORK,
                CONTRACT_INIT,
                "8cefad33c6b2eafe6456e80cd69fda3fcd23b5c4a6719275340f340a9259c26a",
                "e7129809b0262abc43b73dc473f2daa14830a92b8f14c4b6b9aabde3b379b690",
                Number(gas_limit),
            );
            
            console.log(LogColors.brightGreen(`Deploying...`))
            
            const TAG = TransitionTag.Update;

            await TyronTransaction.submit(INITIALIZE as TyronTransaction, tyronAddr, TAG, PARAMS);
        })
        .catch(err => console.error(err))
    }
}

interface Account {
    addr: string;
    privateKey: string;
}
