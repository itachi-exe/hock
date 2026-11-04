// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {ISwapper} from "../src/Interfaces.sol";
import {MockToken} from "./mocks/Mocks.sol";

// Wished-for interface copied from the verified deployed CL router ABI, not a fee-tier API.
interface ICLInputRouter {
    struct ExactInputParams { bytes path; address recipient; uint256 deadline; uint256 amountIn; uint256 amountOutMinimum; }
    function exactInput(ExactInputParams calldata params) external payable returns (uint256);
}

/// Unit seam only. Real deployed router and pool execution is tested separately on a fork.
contract RecordingCLRouter is ICLInputRouter {
    bytes public lastPath;
    address public recipient;
    uint256 public minimum;
    uint256 public deadline;
    bool public shortOutput;
    bool public partialInput;

    function setShortOutput() external { shortOutput = true; }
    function setPartialInput() external { partialInput = true; }

    function exactInput(ExactInputParams calldata params) external payable returns (uint256) {
        lastPath = params.path; recipient = params.recipient; minimum = params.amountOutMinimum; deadline = params.deadline;
        bytes memory path = params.path;
        address input; address output;
        assembly {
            input := shr(96, mload(add(path, 32)))
            output := shr(96, mload(add(add(path, 32), sub(mload(path), 20))))
        }
        MockToken(input).transferFrom(msg.sender, address(this), partialInput ? params.amountIn - 1 : params.amountIn);
        MockToken(output).mint(params.recipient, shortOutput ? params.amountOutMinimum - 1 : params.amountIn);
        return params.amountIn;
    }
}

/// Adversarial unit token. False input calls still change state; a false output transfer does not.
contract ReturnFalseToken {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    uint8 public failure;
    function setFailure(uint8 mode) external { failure = mode; }
    function mint(address who, uint256 amount) external { balanceOf[who] += amount; }
    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return failure != 2;
    }
    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount; balanceOf[to] += amount;
        return failure != 1;
    }
    function transfer(address to, uint256 amount) external returns (bool) {
        if (failure == 3) return false;
        balanceOf[msg.sender] -= amount; balanceOf[to] += amount;
        return true;
    }
}

contract MezoSwapAdapterTest is Test {
    MockToken btc; MockToken musd; MockToken mezo;
    RecordingCLRouter clRouter;
    address alice = address(0xA11CE);

    function setUp() public {
        btc = new MockToken(); musd = new MockToken(); mezo = new MockToken();
        clRouter = new RecordingCLRouter();
        mezo.mint(alice, 100 ether);
    }

    function _adapter() internal returns (ISwapper) {
        return ISwapper(deployCode("MezoSwapAdapter.sol:MezoSwapAdapter", abi.encode(address(clRouter), address(btc), address(musd), address(mezo), int24(50), int24(10))));
    }

    function testFuzz_falseTokenReturnRevertsAtomically(uint8 stage) public {
        stage = uint8(bound(stage, 0, 2));
        ReturnFalseToken input = new ReturnFalseToken(); ReturnFalseToken output = new ReturnFalseToken();
        ISwapper adapter = ISwapper(deployCode("MezoSwapAdapter.sol:MezoSwapAdapter", abi.encode(address(clRouter), address(btc), address(output), address(input), int24(50), int24(10))));
        input.mint(alice, 100 ether);
        if (stage < 2) input.setFailure(stage + 1); else output.setFailure(3);
        vm.startPrank(alice);
        input.approve(address(adapter), 100 ether);
        vm.expectRevert(bytes4(keccak256("TokenTransferFailed()")));
        adapter.swap(address(input), address(output), 100 ether, 90 ether);
        vm.stopPrank();
        assertEq(input.balanceOf(alice), 100 ether);
        assertEq(input.balanceOf(address(adapter)), 0);
        assertEq(output.balanceOf(alice), 0);
        assertEq(output.balanceOf(address(adapter)), 0);
    }

    function test_partialInputFillRevertsWithoutStrandingDust() public {
        ISwapper adapter = _adapter();
        clRouter.setPartialInput();
        mezo.mint(address(adapter), 5 ether);
        vm.startPrank(alice);
        mezo.approve(address(adapter), 100 ether);
        vm.expectRevert(bytes4(keccak256("IncompleteSwap()")));
        adapter.swap(address(mezo), address(musd), 100 ether, 90 ether);
        vm.stopPrank();
        assertEq(mezo.balanceOf(alice), 100 ether);
        assertEq(mezo.balanceOf(address(adapter)), 5 ether);
        assertEq(musd.balanceOf(address(adapter)), 0);
        assertEq(mezo.allowance(address(adapter), address(clRouter)), 0);
    }

    function testFuzz_swapRequiresPositiveAmountAndMinimum(bool emptyAmount) public {
        ISwapper adapter = _adapter();
        vm.startPrank(alice);
        mezo.approve(address(adapter), 100 ether);
        vm.expectRevert(bytes4(keccak256("Slippage()")));
        adapter.swap(address(mezo), address(musd), emptyAmount ? 0 : 100 ether, emptyAmount ? 90 ether : 0);
        vm.stopPrank();
        assertEq(mezo.balanceOf(alice), 100 ether);
    }

    function testFuzz_invalidRouteRejectedBeforePull(bool wrongInput) public {
        ISwapper adapter = _adapter();
        vm.startPrank(alice);
        mezo.approve(address(adapter), 100 ether);
        vm.expectRevert(bytes4(keccak256("BadRoute()")));
        adapter.swap(wrongInput ? address(btc) : address(mezo), wrongInput ? address(musd) : address(mezo), 100 ether, 90 ether);
        vm.stopPrank();
        assertEq(mezo.balanceOf(alice), 100 ether);
        assertEq(mezo.balanceOf(address(clRouter)), 0);
    }

    function testFuzz_adapterRejectsShortActualOutput(bool toBtc) public {
        ISwapper adapter = _adapter();
        clRouter.setShortOutput();
        MockToken out = toBtc ? btc : musd;
        vm.startPrank(alice);
        mezo.approve(address(adapter), 100 ether);
        vm.expectRevert(bytes4(keccak256("Slippage()")));
        adapter.swap(address(mezo), address(out), 100 ether, 90 ether);
        vm.stopPrank();
        assertEq(mezo.balanceOf(alice), 100 ether);
        assertEq(out.balanceOf(alice), 0);
        assertEq(out.balanceOf(address(adapter)), 0);
    }

    function testFuzz_swapExecutesConfiguredTickSpacingRoute(bool toBtc) public {
        ISwapper adapter = _adapter();
        MockToken out = toBtc ? btc : musd;
        vm.startPrank(alice);
        mezo.approve(address(adapter), 100 ether);
        uint256 received = adapter.swap(address(mezo), address(out), 100 ether, 90 ether);
        vm.stopPrank();
        bytes memory expectedPath = abi.encodePacked(address(mezo), int24(50), address(musd));
        if (toBtc) expectedPath = bytes.concat(expectedPath, abi.encodePacked(int24(10), address(btc)));
        assertEq(clRouter.lastPath(), expectedPath);
        assertEq(clRouter.minimum(), 90 ether);
        assertEq(clRouter.deadline(), block.timestamp);
        assertEq(clRouter.recipient(), address(adapter));
        assertEq(received, 100 ether);
        assertEq(out.balanceOf(alice), received);
        assertEq(mezo.balanceOf(alice), 0);
        assertEq(out.balanceOf(address(adapter)), 0);
        assertEq(mezo.balanceOf(address(adapter)), 0);
    }
}
