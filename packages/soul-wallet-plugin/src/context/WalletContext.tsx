import React, { createContext, useState, useEffect } from "react";
import { WalletLib } from "soul-wallet-lib";
import Web3 from "web3";
import { Utils } from "@src/Utils";
import config from "@src/config";
import BN from "bignumber.js";
import KeyStore from "@src/lib/keystore";

// init global instances
const keyStore = KeyStore.getInstance();
const web3 = new Web3(config.provider);

interface IWalletContext {
    web3: Web3;
    account: string;
    // eoa, contract
    walletType: string;
    walletAddress: string;
    getWalletType: () => Promise<void>;
    getEthBalance: () => Promise<string>;
    generateWalletAddress: (val: string, setNew: boolean) => string;
    getGasPrice: () => Promise<number>;
    activateWallet: () => Promise<void>;
    deleteWallet: () => Promise<void>;
    sendErc20: (
        tokenAddress: string,
        to: string,
        amount: string,
    ) => Promise<void>;
    sendEth: (to: string, amount: string) => Promise<void>;
    replaceAddress: () => Promise<void>;
}

export const WalletContext = createContext<IWalletContext>({
    web3,
    account: "",
    walletType: "",
    walletAddress: "",
    getWalletType: async () => {},
    getEthBalance: async () => {
        return "";
    },
    generateWalletAddress: (val: string) => {
        return "";
    },
    getGasPrice: async () => {
        return 0;
    },
    activateWallet: async () => {},
    deleteWallet: async () => {},
    sendErc20: async () => {},
    sendEth: async () => {},
    replaceAddress: async () => {},
});

export const WalletContextProvider = ({ children }: any) => {
    const [account, setAccount] = useState<string>("");
    const [walletAddress, setWalletAddress] = useState<string>("");
    const [walletType, setWalletType] = useState<string>("");

    const getEthBalance = async () => {
        const res = await web3.eth.getBalance(walletAddress);
        return new BN(res).shiftedBy(-18).toString();
    };

    const getGasPrice = async () => {
        return Number(await web3.eth.getGasPrice());
    };

    const getAccount = async () => {
        const res = await keyStore.getAddress();
        setAccount(res);
    };

    const generateWalletAddress = (address: string, setNew?: boolean) => {
        const walletAddress = WalletLib.EIP4337.calculateWalletAddress(
            config.contracts.entryPoint,
            address,
            config.contracts.weth,
            config.contracts.paymaster,
            config.defaultSalt,
        );
        if (setNew) {
            setWalletAddress(walletAddress);
        }
        console.log("generated wallet address", walletAddress);
        return walletAddress;
    };

    const getWalletAddress = () => {
        console.log("trig generate wall addr");
        const res = generateWalletAddress(account);
        setWalletAddress(res);
    };

    const getWalletType = async () => {
        const contractCode = await web3.eth.getCode(walletAddress);
        setWalletType(contractCode !== "0x" ? "contract" : "eoa");
    };

    const executeOperation = async (operation: any) => {
        const requestId = operation.getRequestId(
            config.contracts.entryPoint,
            config.chainId,
        );

        const signature = await keyStore.sign(requestId);

        if (signature) {
            operation.signWithSignature(account, signature || "");

            await Utils.sendOPWait(
                web3,
                operation,
                config.contracts.entryPoint,
                config.chainId,
            );
        }
    };

    const deleteWallet = async () => {
        await keyStore.delete();
    };

    const replaceAddress = async () => {
        await keyStore.replaceAddress();
    };

    const activateWallet = async () => {
        const currentFee = (await getGasPrice()) * config.feeMultiplier;
        const activateOp = WalletLib.EIP4337.activateWalletOp(
            config.contracts.entryPoint,
            config.contracts.paymaster,
            account,
            config.contracts.weth,
            currentFee,
            config.defaultTip,
            config.defaultSalt,
        );

        await executeOperation(activateOp);
    };

    const sendEth = async (to: string, amount: string) => {
        const currentFee = (await getGasPrice()) * config.feeMultiplier;
        const amountInWei = new BN(amount).shiftedBy(18).toString();
        const nonce = await WalletLib.EIP4337.Utils.getNonce(
            walletAddress,
            web3,
        );
        const op = await WalletLib.EIP4337.Tokens.ETH.transfer(
            web3,
            walletAddress,
            nonce,
            config.contracts.entryPoint,
            config.contracts.paymaster,
            currentFee,
            config.defaultTip,
            to,
            amountInWei,
        );

        await executeOperation(op);
    };

    const sendErc20 = async (
        tokenAddress: string,
        to: string,
        amount: string,
    ) => {
        const currentFee = (await getGasPrice()) * config.feeMultiplier;
        const amountInWei = new BN(amount).shiftedBy(18).toString();
        const nonce = await WalletLib.EIP4337.Utils.getNonce(
            walletAddress,
            web3,
        );
        const op = await WalletLib.EIP4337.Tokens.ERC20.transfer(
            web3,
            walletAddress,
            nonce,
            config.contracts.entryPoint,
            config.contracts.paymaster,
            currentFee,
            config.defaultTip,
            tokenAddress,
            to,
            amountInWei,
        );
        await executeOperation(op);
    };

    useEffect(() => {
        if (!account) {
            return;
        }
        getWalletAddress();
    }, [account]);

    useEffect(() => {
        if (!walletAddress) {
            return;
        }
        getWalletType();
    }, [walletAddress]);

    useEffect(() => {
        getAccount();
    }, []);

    return (
        <WalletContext.Provider
            value={{
                web3,
                account,
                walletType,
                walletAddress,
                getWalletType,
                getEthBalance,
                generateWalletAddress,
                getGasPrice,
                activateWallet,
                deleteWallet,
                sendErc20,
                sendEth,
                replaceAddress,
            }}
        >
            {children}
        </WalletContext.Provider>
    );
};

export const WalletContextConsumer = WalletContext.Consumer;
