// SPDX-License-Identifier: MIT
pragma solidity 0.8.4;

import { ICorePool } from "./interfaces/ICorePool.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { IUniswapV2Router02 } from "./interfaces/IUniswapV2Router02.sol";
import { AccessControl } from "./base/AccessControl.sol";

/**
 * @title Illuvium Vault
 *
 * @notice Integration with Sushi.
 *      Receives ETH from an address that exists on IMX which collects in-game purchases
 *      (although technically it could receive ETH from anywhere)
 *
 */
contract Vault is AccessControl {
    /**
     * @dev Auxiliary data structure to store ILV, LP and Locked pools,
     *      linked to this smart contract and receiving vault rewards
     */
    struct Pools {
        ICorePool ilvPool;
        ICorePool pairPool;
        ICorePool lockedPoolV1;
        ICorePool lockedPoolV2;
    }

    /**
     * @dev struct with each core pool address
     */
    Pools public pools;

    /**
     * @dev Link to UniswapV2Router02 deployed instance
     */
    IUniswapV2Router02 public sushi;

    /**
     * @dev Link to IlluviumERC20 token deployed instance
     */
    IERC20 public ilv;

    /**
     * @notice Vault manager is responsible for converting ETH into ILV via Uniswap
     *      and sending that ILV into Illuvium Yield Pool
     *
     * @dev Role ROLE_VAULT_MANAGER allows executing `sendIlvRewards` function
     */
    uint32 public constant ROLE_VAULT_MANAGER = 0x0001_0000;

    /**
     * @notice Pool manager is responsible for setting the pools
     *      which eventually receive the rewards distributed via `sendIlvRewards` function
     *
     * @dev Role ROLE_POOL_MANAGER allows executing `setCorePools` function
     */
    uint32 public constant ROLE_POOL_MANAGER = 0x0002_0000;

    /**
     * @dev Fired in swapEthForIlv() and sendIlvRewards() (via swapEthForIlv)
     *
     * @param _by an address which executed the function
     * @param ethSpent ETH amount sent to Uniswap
     * @param ilvReceived ILV amount received from Uniswap
     */
    event EthIlvSwapped(address indexed _by, uint256 ethSpent, uint256 ilvReceived);

    /**
     * @dev Fired in sendIlvRewards()
     *
     * @param _by an address which executed the function
     * @param _value ILV amount sent to the pool
     */
    event IlvRewardsSent(address indexed _by, uint256 _value);

    /**
     * @dev Fired in default payable receive()
     *
     * @param _by an address which sent ETH into the vault (this contract)
     * @param _value ETH amount received
     */
    event EthReceived(address indexed _by, uint256 _value);

    /**
     * @dev Fired in setCorePools()
     *
     * @param by ROLE_VAULT_MANAGER who executed the setup
     * @param ilvPool deployed ILV core pool address
     * @param pairPool deployed ILV/ETH pair (LP) pool address
     * @param lockedPoolV1 deployed locked pool V1 address
     * @param lockedPoolV2 deployed locked pool V2 address
     */
    event LogSetCorePools(
        address indexed by,
        address ilvPool,
        address pairPool,
        address lockedPoolV1,
        address lockedPoolV2
    );

    /**
     * @notice Creates (deploys) IlluviumVault linked to UniswapV2Router02 and IlluviumERC20 token
     *
     * @param _sushi an address of the UniswapV2Router02 to use for ETH -> ILV exchange
     * @param _ilv an address of the IlluviumERC20 token to use
     */
    constructor(address _sushi, address _ilv) {
        // verify the inputs are set
        require(_sushi != address(0), "sushi address is not set");
        require(_ilv != address(0), "ILV address is not set");

        // assign the values
        sushi = IUniswapV2Router02(_sushi);
        ilv = IERC20(_ilv);
    }

    /**
     * @dev Auxiliary function used as part of the contract setup process to setup core pools,
     *      executed by `ROLE_VAULT_MANAGER` after deployment
     *
     * @param _ilvPool deployed ILV core pool address
     * @param _pairPool deployed ILV/ETH pair (LP) pool address
     * @param _lockedPoolV1 deployed locked pool V1 address
     * @param _lockedPoolV2 deployed locked pool V2 address
     */
    function setCorePools(
        ICorePool _ilvPool,
        ICorePool _pairPool,
        ICorePool _lockedPoolV1,
        ICorePool _lockedPoolV2
    ) external {
        // verify access permissions
        require(isSenderInRole(ROLE_POOL_MANAGER), "access denied");

        // verify all the pools are set/supplied
        require(address(_ilvPool) != address(0), "ILV pool is not set");
        require(address(_pairPool) != address(0), "LP pool is not set");
        require(address(_lockedPoolV1) != address(0), "locked pool v1 is not set");
        require(address(_lockedPoolV2) != address(0), "locked pool v2 is not set");

        // set up
        pools.ilvPool = _ilvPool;
        pools.pairPool = _pairPool;
        pools.lockedPoolV1 = _lockedPoolV1;
        pools.lockedPoolV2 = _lockedPoolV2;

        // emit an event
        emit LogSetCorePools(
            msg.sender,
            address(_ilvPool),
            address(_pairPool),
            address(_lockedPoolV1),
            address(_lockedPoolV2)
        );
    }

    /**
     * @notice Exchanges ETH balance present on the contract into ILV via Uniswap
     *
     * @dev Logs operation via `EthIlvSwapped` event
     *
     * @param _ilvOut expected ILV amount to be received from Uniswap swap
     * @param _deadline maximum timestamp to wait for Uniswap swap (inclusive)
     */
    function swapEthForIlv(
        uint256 _ethIn,
        uint256 _ilvOut,
        uint256 _deadline
    ) public {
        // verify access permissions
        require(isSenderInRole(ROLE_VAULT_MANAGER), "access denied");

        // verify the inputs
        require(_ilvOut > 0, "zero input (ilvOut)");
        require(_deadline >= block.timestamp, "deadline expired");

        // checks if there's enough balance

        require(address(this).balance > _ethIn, "zero ETH balance");

        // create and initialize path array to be used in Uniswap
        // first element of the path determines an input token (what we send to Uniswap),
        // last element determines output token (what we receive from uniwsap)
        address[] memory path = new address[](2);
        // we send ETH wrapped as WETH into Uniswap
        path[0] = sushi.WETH();
        // we receive ILV from Uniswap
        path[1] = address(ilv);

        // exchange ETH -> ILV via Uniswap
        uint256[] memory amounts = sushi.swapExactETHForTokens{ value: _ethIn }(
            _ilvOut,
            path,
            address(this),
            _deadline
        );

        // emit an event logging the operation
        emit EthIlvSwapped(msg.sender, amounts[0], amounts[1]);
    }

    /**
     * @notice Converts an entire contract's ETH balance into ILV via Uniswap and
     *      sends the entire contract's ILV balance to the Illuvium Yield Pool
     *
     * @dev Uses `swapEthForIlv` internally to exchange ETH -> ILV
     *
     * @dev Logs operation via `RewardsDistributed` event
     *
     * @dev Set `ilvOut` or `deadline` to zero to skip `swapEthForIlv` call
     *
     * @param _ilvOut expected ILV amount to be received from Uniswap swap
     * @param _deadline maximum timeout to wait for Uniswap swap
     */
    function sendIlvRewards(
        uint256 _ethIn,
        uint256 _ilvOut,
        uint256 _deadline
    ) external {
        // check if caller has sufficient permissions to send tokens into the pool
        require(isSenderInRole(ROLE_VAULT_MANAGER), "access denied");

        // we treat set `ilvOut` and `deadline` as a flag to execute `swapEthForIlv`
        // in the same time we won't execute the swap if contract balance is zero
        if (_ilvOut > 0 && _deadline > 0 && address(this).balance > 0) {
            // exchange ETH on the contract's balance into ILV via Uniswap - delegate to `swapEthForIlv`
            swapEthForIlv(_ethIn, _ilvOut, _deadline);
        }

        // reads core pools
        (ICorePool ilvPool, ICorePool pairPool, ICorePool lockedPoolV1, ICorePool lockedPoolV2) = (
            pools.ilvPool,
            pools.pairPool,
            pools.lockedPoolV1,
            pools.lockedPoolV2
        );

        // read contract's ILV balance
        uint256 ilvBalance = ilv.balanceOf(address(this));
        // approve the entire ILV balance to be sent into the pool
        if (ilv.allowance(address(this), address(ilvPool)) < ilvBalance) {
            ilv.approve(address(ilvPool), type(uint256).max);
        }
        if (ilv.allowance(address(this), address(pairPool)) < ilvBalance) {
            ilv.approve(address(pairPool), type(uint256).max);
        }
        if (ilv.allowance(address(this), address(lockedPoolV1)) < ilvBalance) {
            ilv.approve(address(lockedPoolV1), type(uint256).max);
        }
        if (ilv.allowance(address(this), address(lockedPoolV2)) < ilvBalance) {
            ilv.approve(address(lockedPoolV2), type(uint256).max);
        }

        // gets poolToken reserves in each pool
        uint256 reserve0 = ilvPool.poolTokenReserve();
        uint256 reserve1 = estimatePairPoolReserve(pairPool);
        uint256 reserve2 = lockedPoolV1.poolTokenReserve();
        uint256 reserve3 = lockedPoolV2.poolTokenReserve();

        // ILV in ILV core pool + ILV in ILV/ETH core pool representation + ILV in locked pool
        uint256 totalReserve = reserve0 + reserve1 + reserve2 + reserve3;

        // amount of ILV to send to ILV core pool
        uint256 amountToSend0 = _getAmountToSend(ilvBalance, reserve0, totalReserve);
        // amount of ILV to send to ILV/ETH core pool
        uint256 amountToSend1 = _getAmountToSend(ilvBalance, reserve1, totalReserve);
        // amount of ILV to send to locked ILV core pool V1
        uint256 amountToSend2 = _getAmountToSend(ilvBalance, reserve2, totalReserve);
        // amount of ILV to send to locked ILV core pool V2
        uint256 amountToSend3 = _getAmountToSend(ilvBalance, reserve3, totalReserve);

        // makes sure we are sending a valid amount
        assert(amountToSend0 + amountToSend1 + amountToSend2 + amountToSend3 <= ilvBalance);

        // sends ILV to both core pools
        ilvPool.receiveVaultRewards(amountToSend0);
        pairPool.receiveVaultRewards(amountToSend1);
        lockedPoolV1.receiveVaultRewards(amountToSend2);
        lockedPoolV2.receiveVaultRewards(amountToSend3);

        // emit an event
        emit IlvRewardsSent(msg.sender, ilvBalance);
    }

    /**
     * @dev Auxiliary function used to estimate LP core pool share among 2 other core pools.
     *      Since LP pool holds ILV in both paired and unpaired forms, this creates some complexity to
     *      properly estimate LP pool share among 2 other pools which contain ILV tokens only
     *
     * @dev The function counts for ILV held in LP pool in unpaired form as is,
     *      for the paired ILV it estimates its amount based on the LP token share the pool has
     *
     * @param pairPool LP core pool extracted from pools structure (gas saving optimization)
     * @return ILV estimate of the LP pool share among 2 other pools
     */
    function estimatePairPoolReserve(ICorePool pairPool) public view returns (uint256) {
        // 1. Determine LP pool share in terms of LP tokens:
        //    LP_share = LP_amt / LP_total; LP_share < 1
        //    where LP_amt is amount of LP tokens in the pool,
        //    and LP_total is total LP tokens supply
        uint256 LP_amt = pairPool.poolTokenReserve();
        uint256 LP_total = IERC20(pairPool.poolToken()).totalSupply();
        // uint256 LP_share = LP_amt / LP_total; - this will always be zero due to int rounding down,
        // therefore we don't calculate the share, but apply it to the calculations below

        // Note: for LP core pool `poolTokenReserve` doesn't count for ILV tokens pool holds

        // 2. Considering that LP pool share in terms of ILV tokens is the same as in terms of LP tokens,
        //    ILV_share = LP_share, ILV amount the LP pool has in LP tokens would be estimated as
        //    ILV_amt = ILV_total * ILV_share = ILV_total * LP_share
        uint256 ILV_total = ilv.balanceOf(pairPool.poolToken());
        uint256 ILV_amt = (ILV_total * LP_amt) / LP_total;

        // 3. Finally, LP pool can have some ILV present directly on its balance and not in LP pair
        uint256 ILV_balance = ilv.balanceOf(address(pairPool));

        // we estimate the result as a sum of the two (2) and (3):
        return ILV_amt + ILV_balance;
    }

    /**
     * @dev Auxiliary function to calculate amount of rewards to send to the pool
     *      based on ILV rewards available to be split between the pools,
     *      particular pool reserve and total reserve of all the pools
     *
     * @dev A particular pool receives an amount proportional to its reserves
     *
     * @param _ilvBalance available amount of rewards to split between the pools
     * @param _poolReserve particular pool reserves
     * @param _totalReserve total cumulative reserves of all the pools to split rewards between
     */
    function _getAmountToSend(
        uint256 _ilvBalance,
        uint256 _poolReserve,
        uint256 _totalReserve
    ) private pure returns (uint256) {
        return (_ilvBalance * ((_poolReserve * 1e7) / _totalReserve)) / 1e7;
    }

    /**
     * @notice Default payable function, allows to top up contract's ETH balance
     *      to be exchanged into ILV via Uniswap
     *
     * @dev Logs operation via `EthReceived` event
     */
    receive() external payable {
        // emit an event
        emit EthReceived(msg.sender, msg.value);
    }
}
