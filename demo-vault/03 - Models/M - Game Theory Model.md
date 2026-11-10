---
modified:
  - 23-04-2026 12:59:37
  - 09-09-2026 02:38:34
created: 23-04-2026 12:56:22
tags:
  - psychology/Game_Theory
  - economics/Economics
  - trading/Quantitative_Finance
layer: model
type: core
domain:
  - game-theory
  - economics
  - decision-making
  - quantitative-finance
---
## 1. Definition

**Game Theory Model** là framework toán học dùng để phân tích các tình huống mà nhiều tác nhân (agents) tương tác chiến lược với nhau, trong đó kết quả của mỗi bên phụ thuộc vào hành động của các bên khác.

## 2. Based On Concepts

- C - Strategist Thinking  
- C - Optimization  
- C - Probability  
- C - Utility  

## 3. Mathematical Formulation (BẮT BUỘC)

**(1) Game structure**  
$$G = (N, S, U)$$  

Trong đó:
- $N$: tập người chơi  
- $S$: tập chiến lược  
- $U$: payoff function  

**(2) Nash Equilibrium**  
$$s_i^* = \arg\max_{s_i} U_i(s_i, s_{-i}^*)$$  

→ Không ai có incentive đơn phương đổi chiến lược  

## 4. Types of Games

- Cooperative vs Non-cooperative  
- Zero-sum vs Non-zero-sum  
- Static vs Dynamic  
- Complete vs Incomplete information  

## 5. What it captures

- Strategic interaction  
- Competition vs cooperation  
- Incentive structure  
- Equilibrium behavior  

## 6. Key Concepts

- Nash Equilibrium  
- Dominant strategy  
- Mixed strategy  
- Payoff matrix  

## 7. Formalized By (Models)

- M - Nash Equilibrium  
- M - Mechanism Design Model  

## 8. Related Concepts
- M - Chicken Game

- C - Market Microstructure  
- C - Liquidity  
- S - Arbitrage  
- C - Strategist Thinking  

## 9. Applications (High-level)

- Market making competition  
- Auction design  
- Order placement strategy  
- Adversarial trading  

## 10. Key Insights

- Market = multi-agent system  
- Optimal decision phụ thuộc hành vi người khác  
- Equilibrium ≠ optimal global outcome  

## 11. Pitfalls

- Assumption rationality quá mạnh  
- Khó estimate payoff thực tế  
- Dynamic markets → equilibrium không stable  
- Oversimplification  

## 12. Minimal Example (optional)

- 2 traders:
  - Buy vs Sell  
→ payoff phụ thuộc nhau

## Demo links

_Added for the 3D-Graph demo vault so the floors connect to each other._

- [[C - Information Asymmetry]]
- [[S - Premortem]]
