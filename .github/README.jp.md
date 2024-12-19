<div align="center">

<p align="right">
   <a href="../README.md">English</a> | <a href="./README.cn.md">中文</a> | <strong>日本語</strong>
</p>


# AIゲートウェイ
#### 1つの高速でフレンドリーなAPIで200以上のLLMに確実にルーティング
<img src="docs/images/demo.gif" width="650" alt="Gateway Demo"><br>

[![License](https://img.shields.io/github/license/Ileriayo/markdown-badges)](./LICENSE)
[![Discord](https://img.shields.io/discord/1143393887742861333)](https://portkey.ai/community)
[![Twitter](https://img.shields.io/twitter/url/https/twitter/follow/portkeyai?style=social&label=Follow%20%40PortkeyAI)](https://twitter.com/portkeyai)
[![npm version](https://badge.fury.io/js/%40portkey-ai%2Fgateway.svg)](https://www.npmjs.com/package/@portkey-ai/gateway)
[![Better Stack Badge](https://uptime.betterstack.com/status-badges/v1/monitor/q94g.svg)](https://status.portkey.ai/?utm_source=status_badge)

</div>

[AIゲートウェイ](https://portkey.ai/features/ai-gateway)は、250以上の言語、ビジョン、オーディオ、画像モデルへのリクエストを統一されたAPIで簡素化します。キャッシング、フォールバック、リトライ、タイムアウト、ロードバランシングをサポートし、最小の遅延でエッジデプロイが可能なプロダクション対応のゲートウェイです。

✅&nbsp; **超高速**（9.9倍速）で**小さなフットプリント**（ビルド後約100kb）<br>
✅&nbsp; 複数のモデル、プロバイダー、キー間で**ロードバランシング**<br>
✅&nbsp; **フォールバック**でアプリの信頼性を確保<br>
✅&nbsp; デフォルトで**自動リトライ**（指数関数的フォールバック）<br>
✅&nbsp; **リクエストタイムアウト**の設定が可能<br>
✅&nbsp; **マルチモーダル**でビジョン、TTS、STT、画像生成モデルをサポート<br>
✅&nbsp; 必要に応じてミドルウェアを**プラグイン**<br>
✅&nbsp; **480Bトークン**以上の実績<br>
✅&nbsp; **エンタープライズ対応**でセキュリティ、スケール、カスタムデプロイメントをサポート<br><br>

> [!TIP]
>  ⭐️ **このリポジトリにスターを付ける**ことで、新しいプロバイダー統合や機能のGitHubリリース通知を受け取ることができます。

![star-2](https://github.com/user-attachments/assets/53597dce-6333-4ecc-a154-eb05532954e4)

<details>
  <summary><kbd>スター履歴</kbd></summary>
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=portkey-ai%2Fgateway&theme=dark&type=Date">
    <img width="100%" src="https://api.star-history.com/svg?repos=portkey-ai%2Fgateway&type=Date">
  </picture>
</details>
<br>

## セットアップとインストール
AIゲートウェイを使用するには、**ホストされたAPI**を使用するか、**オープンソース**または**エンタープライズバージョン**を自分の環境にセルフホストします。
<br>

### 👉 portkey.aiでホストされたゲートウェイ（最速）
ホストされたAPIは、ジェネレーティブAIアプリケーションのためのAIゲートウェイをセットアップする最速の方法です。私たちは**毎日数十億のトークン**を処理しており、Postman、Haptik、Turing、MultiOn、SiteGPTなどの企業でプロダクションで使用されています。

<a href="https://app.portkey.ai/signup"><img src="https://portkey.ai/blog/content/images/2024/08/Get-API-Key--3-.png" height=50 alt="Get API Key" /></a><br>
<br>

### 👉 オープンソースバージョンのセルフホスト（[MITライセンス](https://github.com/Portkey-AI/gateway?tab=MIT-1-ov-file#readme)）

ローカルでAIゲートウェイを実行するには、ターミナルで以下のコマンドを実行します。（npxがインストールされている必要があります）または、[Cloudflare](https://github.com/Portkey-AI/gateway/blob/main/docs/installation-deployments.md#cloudflare-workers)、[Docker](https://github.com/Portkey-AI/gateway/blob/main/docs/installation-deployments.md#docker)、[Node.js](https://github.com/Portkey-AI/gateway/blob/main/docs/installation-deployments.md#nodejs-server)などのデプロイメントガイドを参照してください。
```bash
npx @portkey-ai/gateway
```
<sup>あなたのAIゲートウェイはhttp://localhost:8787で実行されています 🚀</sup>
<br>

### 👉 エンタープライズバージョンのセルフホスト
AIゲートウェイのエンタープライズバージョンは、**組織管理**、**ガバナンス**、**セキュリティ**などのエンタープライズ対応機能を提供します。オープンソース、ホスト、エンタープライズバージョンの比較は[こちら](https://docs.portkey.ai/docs/product/product-feature-comparison)をご覧ください。

エンタープライズデプロイメントアーキテクチャ、サポートされているプラットフォームについては、[**エンタープライズプライベートクラウドデプロイメント**](https://docs.portkey.ai/docs/product/enterprise-offering/private-cloud-deployments)をご覧ください。

<a href="https://portkey.sh/demo-22"><img src="https://portkey.ai/blog/content/images/2024/08/Get-API-Key--5-.png" height=50 alt="Book an enterprise AI gateway demo" /></a><br>

<br>

## AIゲートウェイを通じたリクエストの作成

### <img src="docs/images/openai.png" height=15 /> OpenAI API & SDKと互換性あり

AIゲートウェイはOpenAI API & SDKと互換性があり、200以上のLLMに信頼性のある呼び出しを拡張します。ゲートウェイを通じてOpenAIを使用するには、**クライアントを更新**してゲートウェイのURLとヘッダーを含め、通常通りリクエストを行います。AIゲートウェイは、OpenAI形式で書かれたリクエストを指定されたプロバイダーが期待するシグネチャに変換できます。[例を表示](https://docs.portkey.ai/docs/guides/getting-started/getting-started-with-ai-gateway)
<br><br>

### <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/c/c3/Python-logo-notext.svg/1869px-Python-logo-notext.svg.png" height=15 /> Python SDKの使用 &nbsp;&nbsp;<a href="https://colab.research.google.com/drive/1hLvoq_VdGlJ_92sPPiwTznSra5Py0FuW?usp=sharing"><img src="https://colab.research.google.com/assets/colab-badge.svg"></a>
[Portkey Python SDK](https://github.com/Portkey-AI/portkey-python-sdk)は、OpenAI Python SDKのラッパーであり、他のすべてのプロバイダーに対する追加パラメータのサポートを提供します。**Pythonで構築している場合、これはゲートウェイに接続するための推奨ライブラリです**。
```bash
pip install -qU portkey-ai
```
<br>


### <img src="https://cdn-icons-png.flaticon.com/512/5968/5968322.png" height=15 /> Node.JS SDKの使用
[Portkey JS/TS SDK](https://www.npmjs.com/package/portkey-ai)は、OpenAI JS SDKのラッパーであり、他のすべてのプロバイダーに対する追加パラメータのサポートを提供します。**JSまたはTSで構築している場合、これはゲートウェイに接続するための推奨ライブラリです**。

```bash
npm install --save portkey-ai
```
<br>


### <img src="https://www.svgrepo.com/show/305922/curl.svg" height=15 /> REST APIの使用
AIゲートウェイは、すべての他のプロバイダーとモデルに対する追加パラメータのサポートを備えたOpenAI互換エンドポイントをサポートします。[APIリファレンスを表示](https://docs.portkey.ai/docs/api-reference/introduction)。
<br><br>

### その他の統合

| 言語          | サポートされているSDK                                                                                                                                                                                                                                                                                                  |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| JS / TS |  [LangchainJS](https://www.npmjs.com/package/langchain) <br> [LlamaIndex.TS](https://www.npmjs.com/package/llamaindex)                                                                      |
| Python            | <br> [Langchain](https://portkey.ai/docs/welcome/integration-guides/langchain-python) <br> [LlamaIndex](https://portkey.ai/docs/welcome/integration-guides/llama-index-python) |
| Go                | [go-openai](https://github.com/sashabaranov/go-openai)                                                                                                                                                                                                                                                          |
| Java              | [openai-java](https://github.com/TheoKanning/openai-java)                                                                                                                                                                                                                                                       |
| Rust              | [async-openai](https://docs.rs/async-openai/latest/async_openai/)                                                                                                                                                                                                                                               |
| Ruby              | [ruby-openai](https://github.com/alexrudall/ruby-openai)                                                                                                                                                                                                                                                        |
<br>



## ゲートウェイクックブック

### トレンドのクックブック
- [Nvidia NIM](/cookbook/providers/nvidia.ipynb)のモデルをAIゲートウェイで使用する
- [CrewAIエージェント](/cookbook/monitoring-agents/CrewAI_with_Telemetry.ipynb)をPortkeyで監視する
- AIゲートウェイで[トップ10のLMSYSモデルを比較する](./use-cases/LMSYS%20Series/comparing-top10-LMSYS-models-with-Portkey.ipynb)

### 最新のクックブック
* [Nemotronを使用して合成データセットを作成する](/cookbook/use-cases/Nemotron_GPT_Finetuning_Portkey.ipynb)
* [PortkeyゲートウェイをVercelのAI SDKと使用する](/cookbook/integrations/vercel-ai.md)
* [PortkeyでLlamaエージェントを監視する](/cookbook/monitoring-agents/Llama_Agents_with_Telemetry.ipynb)



### [その他の例](https://github.com/Portkey-AI/gateway/tree/main/cookbook)

## サポートされているプロバイダー

[25以上のプロバイダー](https://portkey.ai/docs/welcome/integration-guides)と[6以上のフレームワーク](https://portkey.ai/docs/welcome/integration-guides)とのゲートウェイ統合を探索してください。

|                                                                                                                            | プロバイダー                                                                                      | サポート | ストリーム |
| -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------- | ------ |
| <img src="docs/images/openai.png" width=35 />                                                                              | [OpenAI](https://portkey.ai/docs/welcome/integration-guides/openai)                           | ✅       | ✅      |
| <img src="docs/images/azure.png" width=35>                                                                                 | [Azure OpenAI](https://portkey.ai/docs/welcome/integration-guides/azure-openai)               | ✅       | ✅      |
| <img src="docs/images/anyscale.png" width=35>                                                                              | [Anyscale](https://portkey.ai/docs/welcome/integration-guides/anyscale-llama2-mistral-zephyr) | ✅       | ✅      |
| <img src="https://upload.wikimedia.org/wikipedia/commons/2/2d/Google-favicon-2015.png" width=35>                           | [Google Gemini & Palm](https://portkey.ai/docs/welcome/integration-guides/gemini)             | ✅       | ✅      |
| <img src="docs/images/anthropic.png" width=35>                                                                             | [Anthropic](https://portkey.ai/docs/welcome/integration-guides/anthropic)                     | ✅       | ✅      |
| <img src="docs/images/cohere.png" width=35>                                                                                | [Cohere](https://portkey.ai/docs/welcome/integration-guides/cohere)                           | ✅       | ✅      |
| <img src="https://assets-global.website-files.com/64f6f2c0e3f4c5a91c1e823a/654693d569494912cfc0c0d4_favicon.svg" width=35> | [Together AI](https://portkey.ai/docs/welcome/integration-guides/together-ai)                 | ✅       | ✅      |
| <img src="https://www.perplexity.ai/favicon.svg" width=35>                                                                 | [Perplexity](https://portkey.ai/docs/welcome/integration-guides/perplexity-ai)                | ✅       | ✅      |
| <img src="https://docs.mistral.ai/img/favicon.ico" width=35>                                                               | [Mistral](https://portkey.ai/docs/welcome/integration-guides/mistral-ai)                      | ✅       | ✅      |
| <img src="https://docs.nomic.ai/img/nomic-logo.png" width=35>                                                              | [Nomic](https://portkey.ai/docs/welcome/integration-guides/nomic)                             | ✅       | ✅      |
| <img src="https://files.readme.io/d38a23e-small-studio-favicon.png" width=35>                                              | [AI21](https://portkey.ai/docs/welcome/integration-guides)                                    | ✅       | ✅      |
| <img src="https://platform.stability.ai/small-logo-purple.svg" width=35>                                                   | [Stability AI](https://portkey.ai/docs/welcome/integration-guides/stability-ai)               | ✅       | ✅      |
| <img src="https://deepinfra.com/_next/static/media/logo.4a03fd3d.svg" width=35>                                            | [DeepInfra](https://portkey.ai/docs/welcome/integration-guides)                               | ✅       | ✅      |
| <img src="https://ollama.com/public/ollama.png" width=35>                                                                  | [Ollama](https://portkey.ai/docs/welcome/integration-guides/ollama)                           | ✅       | ✅      |
| <img src="https://novita.ai/favicon.ico" width=35>                                                                         | Novita AI                                                                                     | ✅       | ✅      | `/chat/completions`, `/completions` |

> [サポートされている200以上のモデルの完全なリストを表示](https://portkey.ai/docs/welcome/what-is-portkey#ai-providers-supported)
<br>

<br>

## エージェント
ゲートウェイは、人気のあるエージェントフレームワークとシームレスに統合されます。[ドキュメントを読む](https://docs.portkey.ai/docs/welcome/agents)。  


| フレームワーク | 200以上のLLMを呼び出す | 高度なルーティング | キャッシング | ロギングとトレース* | オブザーバビリティ* | プロンプト管理* |
|------------------------------|--------|-------------|---------|------|---------------|-------------------|
| [Autogen](https://docs.portkey.ai/docs/welcome/agents/autogen)    | ✅     | ✅          | ✅      | ✅   | ✅            | ✅                |
| [CrewAI](https://docs.portkey.ai/docs/welcome/agents/crewai)             | ✅     | ✅          | ✅      | ✅   | ✅            | ✅                |
| [LangChain](https://docs.portkey.ai/docs/welcome/agents/langchain-agents)             | ✅     | ✅          | ✅      | ✅   | ✅            | ✅                |
| [Phidata](https://docs.portkey.ai/docs/welcome/agents/phidata)             | ✅     | ✅          | ✅      | ✅   | ✅            | ✅                |
| [Llama Index](https://docs.portkey.ai/docs/welcome/agents/llama-agents)             | ✅     | ✅          | ✅      | ✅   | ✅            | ✅                |
| [Control Flow](https://docs.portkey.ai/docs/welcome/agents/control-flow) | ✅     | ✅          | ✅      | ✅   | ✅            | ✅                |
| [独自のエージェントを構築する](https://docs.portkey.ai/docs/welcome/agents/bring-your-own-agents) | ✅     | ✅          | ✅      | ✅   | ✅            | ✅                |

<br>

*ホストされたアプリでのみ利用可能です。詳細なドキュメントは[こちら](https://docs.portkey.ai/docs/welcome/agents)をご覧ください。 


## 機能

<table width=100%>
  <tr>
    <td width="50%">
      <strong><a href="https://portkey.ai/docs/product/ai-gateway-streamline-llm-integrations/fallbacks">フォールバック</a></strong><br/>
      失敗したリクエストに対して別のプロバイダーやモデルにフォールバックします。トリガーするエラーを指定できます。アプリケーションの信頼性を向上させます。
      <br><br>
      <img src="https://framerusercontent.com/images/gmlOW8yeKP2pGuIsObM6gKLzeMI.png" height=100 />
    </td>
    <td width="50%">
      <strong><a href="https://portkey.ai/docs/product/ai-gateway-streamline-llm-integrations/automatic-retries">自動リトライ</a></strong><br/>
      失敗したリクエストを最大5回自動的にリトライします。指数関数的バックオフ戦略により、リトライ試行の間隔を空けてネットワークの過負荷を防ぎます。
      <br><br>
      <img src="https://github.com/roh26it/Rubeus/assets/971978/8a6e653c-94b2-4ba7-95c7-93544ee476b1" height=100 />
    </td>
  </tr>
  
</table>
<table width="100%">
  <tr>
    <td width="50%"> 
      <strong><a href="https://portkey.ai/docs/product/ai-gateway-streamline-llm-integrations/load-balancing">ロードバランシング</a></strong><br/>
      複数のAPIキーやAIプロバイダー間でLLMリクエストを重み付けして分散させ、高可用性と最適なパフォーマンスを確保します。
      <br><br>
      <img src="https://framerusercontent.com/images/6EWuq3FWhqrPe3kKLqVspevi4.png" height=100 />
    </td>
    <td width="50%">
      <strong><a href="https://portkey.ai/docs/product/ai-gateway-streamline-llm-integrations/request-timeouts">リクエストタイムアウト</a></strong></br><br/>
      応答しないLLMリクエストを自動的に終了させるために、詳細なリクエストタイムアウトを設定します。
      <br><br>
      <img src="https://github.com/vrushankportkey/gateway/assets/134934501/b23b98b2-6451-4747-8898-6847ad8baed4" height=100 />
    </td>
  </tr>
</table>

</table>
<table width="100%">
  <tr>
    <td width="50%"> 
      <strong><a href="https://docs.portkey.ai/docs/product/ai-gateway-streamline-llm-integrations/multimodal-capabilities">マルチモーダルLLMゲートウェイ</a></strong><br/>
      ビジョン、オーディオ（テキストから音声、音声からテキスト）、画像生成モデルを複数のプロバイダーから呼び出すことができます — すべてOpenAIのシグネチャを使用して
      <br><br>
      <img src="https://docs.portkey.ai/~gitbook/image?url=https%3A%2F%2F2878743244-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252Fy3MCfQqftZOnHqSmVV5x%252Fuploads%252FOVuOxN4uFdBp1BdXX4E6%252Fmultimodal-icon.png%3Falt%3Dmedia%26token%3Db8b7bd49-0194-4d2f-89d4-c6633a872372&width=768&dpr=2&quality=100&sign=f51129a9&sv=1" height=100 />
    </td>
    <td width="50%">
      <strong><a href="https://docs.portkey.ai/docs/product/guardrails">ガードレール</a></strong></br><br/>
      指定されたチェックに従ってLLMの入力と出力をリアルタイムで検証します。独自のチェックを作成するか、20以上の事前構築されたガードレールから選択できます。
      <br><br>
      <img src="https://docs.portkey.ai/~gitbook/image?url=https%3A%2F%2F2878743244-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252Fy3MCfQqftZOnHqSmVV5x%252Fuploads%252FDFkhZpqtBfQMIW9BhVum%252Fguardrails-icon.png%3Falt%3Dmedia%26token%3D91cfe226-5ce9-44b3-a0e8-be9f3ae3917f&width=768&dpr=2&quality=100&sign=73608afc&sv=1" height=100 />
    </td>
  </tr>
</table>

**これらの機能は、`x-portkey-config`ヘッダーまたはSDKの`config`パラメータに追加されたゲートウェイ設定を通じて構成されます。**

以下は、上記の機能を示すサンプル設定JSONです。すべての機能はオプションです。

```json
{
	"retry": { "attempts": 5 },
	"request_timeout": 10000,
	"strategy": { "mode": "fallback" }, // または 'loadbalance' など
	"targets": [{
		"provider": "openai",
		"api_key": "sk-***"
	},{
		"strategy": {"mode": "loadbalance"}, // オプションのネスト
		"targets": {...}
	}]
}
```

次に、APIリクエストに設定を使用します。


### ゲートウェイ設定の使用

リクエストで設定オブジェクトを使用する方法については、[こちらのガイド](https://portkey.ai/docs/api-reference/config-object)をご覧ください。

<br>


## ゲートウェイエンタープライズバージョン
AIアプリを<ins>信頼性</ins>と<ins>将来の互換性</ins>を高め、完全な<ins>データセキュリティ</ins>と<ins>プライバシー</ins>を確保します。

✅&nbsp; セキュアなキー管理 - ロールベースのアクセス制御とトラッキングのため<br>
✅&nbsp; シンプルでセマンティックなキャッシング - 繰り返しのクエリを高速に提供し、コストを削減<br>
✅&nbsp; アクセス制御とインバウンドルール - 接続できるIPと地域を制御<br>
✅&nbsp; PII削除 - リクエストから自動的に機密データを削除し、意図しない露出を防止<br>
✅&nbsp; SOC2、ISO、HIPAA、GDPRコンプライアンス - ベストセキュリティプラクティスのため<br>
✅&nbsp; プロフェッショナルサポート - 機能の優先順位付けとともに<br>

[エンタープライズデプロイメントについての相談を予約する](https://portkey.sh/demo-22)

<br>


## 貢献

最も簡単な貢献方法は、`good first issue`タグの付いた問題を選ぶことです 💪。貢献ガイドラインは[こちら](/.github/CONTRIBUTING.md)をご覧ください。

バグ報告？[こちらで提出](https://github.com/Portkey-AI/gateway/issues) | 機能リクエスト？[こちらで提出](https://github.com/Portkey-AI/gateway/issues)

<br>

## コミュニティ

世界中の成長するコミュニティに参加して、AIに関するヘルプ、アイデア、ディスカッションを行いましょう。

- 公式[ブログ](https://portkey.ai/blog)を閲覧する
- [Discord](https://portkey.ai/community)でリアルタイムチャット
- [Twitter](https://twitter.com/PortkeyAI)でフォロー
- [LinkedIn](https://www.linkedin.com/company/portkey-ai/)で接続
- [日本語のドキュメント](./.github/README.jp.md)を読む
<!-- - [YouTube](https://www.youtube.com/channel/UCZph50gLNXAh1DpmeX8sBdw)で訪問 -->
<!-- - [Devコミュニティ](https://dev.to/portkeyai)に参加 -->
<!-- - [Stack Overflow](https://stackoverflow.com/questions/tagged/portkey)で#portkeyタグの質問を閲覧 -->

![Rubeus Social Share (4)](https://github.com/Portkey-AI/gateway/assets/971978/89d6f0af-a95d-4402-b451-14764c40d03f)
