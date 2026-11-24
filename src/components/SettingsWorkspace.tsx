import { useEffect, useState } from "react";
import {
  CheckCircle2,
  KeyRound,
  LoaderCircle,
  LockKeyhole,
  Save,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";

interface ModelSettings {
  baseUrl: string;
  textModel: string;
  visionModel: string;
  keyConfigured: boolean;
  keyHint: string;
  source: "environment" | "local";
}

interface SettingsWorkspaceProps {
  onStatusChange: (configured: boolean) => void;
}

const emptySettings: ModelSettings = {
  baseUrl: "https://api.deepseek.com",
  textModel: "deepseek-v4-pro",
  visionModel: "deepseek-flash",
  keyConfigured: false,
  keyHint: "",
  source: "local",
};

export default function SettingsWorkspace({
  onStatusChange,
}: SettingsWorkspaceProps) {
  const [settings, setSettings] = useState<ModelSettings>(emptySettings);
  const [apiKey, setApiKey] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [notice, setNotice] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    fetch("/api/settings/model")
      .then(async (response) => {
        if (!response.ok) throw new Error("无法读取本地模型配置");
        const payload = (await response.json()) as ModelSettings;
        setSettings(payload);
        onStatusChange(payload.keyConfigured);
      })
      .catch((error) =>
        setNotice({
          tone: "error",
          text:
            error instanceof Error ? error.message : "无法读取本地模型配置",
        }),
      )
      .finally(() => setIsLoading(false));
  }, [onStatusChange]);

  async function saveSettings() {
    setIsSaving(true);
    setNotice(null);
    try {
      const response = await fetch("/api/settings/model", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey,
          baseUrl: settings.baseUrl,
          textModel: settings.textModel,
          visionModel: settings.visionModel,
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | (ModelSettings & { detail?: string })
        | null;
      if (!response.ok || !payload) {
        throw new Error(payload?.detail ?? "保存失败");
      }
      setSettings(payload);
      setApiKey("");
      onStatusChange(payload.keyConfigured);
      setNotice({
        tone: "success",
        text: "模型配置已保存到本地后端，不会写入浏览器或 Git。",
      });
    } catch (error) {
      setNotice({
        tone: "error",
        text: error instanceof Error ? error.message : "保存失败",
      });
    } finally {
      setIsSaving(false);
    }
  }

  async function testConnection() {
    setIsTesting(true);
    setNotice(null);
    try {
      const response = await fetch("/api/settings/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey,
          baseUrl: settings.baseUrl,
          textModel: settings.textModel,
          visionModel: settings.visionModel,
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | {
            detail?: string;
            models?: string[];
            textModelAvailable?: boolean;
            visionModelAvailable?: boolean;
          }
        | null;
      if (!response.ok || !payload) {
        throw new Error(payload?.detail ?? "连接测试失败");
      }
      const modelCount = payload.models?.length ?? 0;
      setNotice({
        tone: "success",
        text:
          `连接成功，共发现 ${modelCount} 个模型。` +
          (payload.textModelAvailable ? " 文本模型可用。" : " 文本模型名称未在模型列表中。") +
          (payload.visionModelAvailable ? " 视觉模型可用。" : " 视觉模型名称未在模型列表中。"),
      });
    } catch (error) {
      setNotice({
        tone: "error",
        text: error instanceof Error ? error.message : "连接测试失败",
      });
    } finally {
      setIsTesting(false);
    }
  }

  async function deleteKey() {
    setNotice(null);
    try {
      const response = await fetch("/api/settings/model/key", {
        method: "DELETE",
      });
      const payload = (await response.json().catch(() => null)) as
        | (ModelSettings & { detail?: string })
        | null;
      if (!response.ok || !payload) {
        throw new Error(payload?.detail ?? "删除 Key 失败");
      }
      setSettings(payload);
      onStatusChange(payload.keyConfigured);
      setNotice({ tone: "success", text: "本地 API Key 已删除。" });
    } catch (error) {
      setNotice({
        tone: "error",
        text: error instanceof Error ? error.message : "删除 Key 失败",
      });
    }
  }

  return (
    <div className="settings-workspace">
      <section className="settings-heading">
        <div>
          <div className="eyebrow">
            <KeyRound size={15} />
            模型设置
          </div>
          <h1>使用你自己的模型。</h1>
          <p>
            当前首版使用 DeepSeek OpenAI 兼容接口。Key 只发送到本地后端，
            不写入浏览器存储、项目文件或诊断日志。
          </p>
        </div>
        <div className="security-seal">
          <LockKeyhole size={19} />
          <div>
            <strong>本地保存</strong>
            <span>配置目录已被 Git 忽略</span>
          </div>
        </div>
      </section>

      {notice ? (
        <div
          className={`generation-notice ${notice.tone}`}
          role={notice.tone === "error" ? "alert" : "status"}
        >
          {notice.tone === "success" ? (
            <CheckCircle2 size={17} />
          ) : (
            <X size={17} />
          )}
          <span>{notice.text}</span>
        </div>
      ) : null}

      <section className="settings-panel">
        <div className="exam-panel-heading">
          <div>
            <span className="panel-kicker">DEEPSEEK V4</span>
            <h2>模型连接</h2>
          </div>
          <span className={`settings-source ${settings.source}`}>
            {settings.source === "environment"
              ? "环境变量优先"
              : settings.keyConfigured
                ? "已配置"
                : "未配置"}
          </span>
        </div>

        {isLoading ? (
          <div className="settings-loading">
            <LoaderCircle className="spin" size={18} />
            正在读取本地配置…
          </div>
        ) : (
          <div className="settings-form">
            {settings.source === "environment" ? (
              <div className="settings-env-note">
                当前模型配置来自环境变量。环境变量优先于页面保存，
                如需直接管理 Key，请先在启动环境中移除对应变量。
              </div>
            ) : null}
            <label className="field">
              <span>OpenAI 兼容接口地址</span>
              <input
                value={settings.baseUrl}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    baseUrl: event.target.value,
                  }))
                }
                placeholder="https://api.deepseek.com"
              />
            </label>
            <label className="field">
              <span>DeepSeek API Key</span>
              <div className="secret-field">
                <input
                  type="password"
                  autoComplete="off"
                  value={apiKey}
                  onChange={(event) => setApiKey(event.target.value)}
                  placeholder={
                    settings.keyConfigured
                      ? `已配置 ${settings.keyHint}，输入新 Key 可替换`
                      : "sk-..."
                  }
                />
                {settings.keyConfigured ? (
                  <ShieldCheck size={17} aria-label="已配置 Key" />
                ) : null}
              </div>
            </label>
            <div className="settings-model-grid">
              <label className="field">
                <span>文本与推理模型</span>
                <input
                  value={settings.textModel}
                  onChange={(event) =>
                    setSettings((current) => ({
                      ...current,
                      textModel: event.target.value,
                    }))
                  }
                />
              </label>
              <label className="field">
                <span>视觉模型</span>
                <input
                  value={settings.visionModel}
                  onChange={(event) =>
                    setSettings((current) => ({
                      ...current,
                      visionModel: event.target.value,
                    }))
                  }
                />
              </label>
            </div>
            <div className="settings-hint">
              文本模型用于知识图谱、出题和复盘；视觉模型用于公式页与真题图片。
            </div>
            <div className="settings-actions">
              <button
                type="button"
                className="button secondary-button"
                disabled={isTesting}
                onClick={() => void testConnection()}
              >
                {isTesting ? (
                  <LoaderCircle className="spin" size={16} />
                ) : (
                  <ShieldCheck size={16} />
                )}
                {isTesting ? "正在测试…" : "测试连接"}
              </button>
              <button
                type="button"
                className="button primary-button"
                disabled={isSaving}
                onClick={() => void saveSettings()}
              >
                {isSaving ? (
                  <LoaderCircle className="spin" size={16} />
                ) : (
                  <Save size={16} />
                )}
                {isSaving ? "正在保存…" : "保存配置"}
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="settings-panel settings-safety">
        <div className="exam-side-title">
          <ShieldCheck size={17} />
          <h2>安全与隐私</h2>
        </div>
        <div className="settings-safety-grid">
          <div>
            <strong>不会上传到项目作者</strong>
            <span>资料只从本地后端发送到你配置的模型服务商。</span>
          </div>
          <div>
            <strong>不会进入 Git</strong>
            <span>本地模型配置位于 ignored 目录。</span>
          </div>
          <div>
            <strong>可随时删除</strong>
            <span>删除 Key 后，后续模型请求会立即停止。</span>
          </div>
        </div>
        {settings.keyConfigured && settings.source === "local" ? (
          <button
            type="button"
            className="danger-link"
            onClick={() => void deleteKey()}
          >
            <Trash2 size={15} />
            删除本地 API Key
          </button>
        ) : null}
      </section>
    </div>
  );
}
