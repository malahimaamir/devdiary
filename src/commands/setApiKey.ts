import * as vscode from 'vscode';
import { getConfig } from '../config';
import { KEY_PROVIDERS, type KeyProviderId, secretKey } from '../ai/providers';

interface KeyProviderItem extends vscode.QuickPickItem {
  id: KeyProviderId;
}

const PROVIDER_INFO: Record<KeyProviderId, { label: string; url: string }> = {
  claude: { label: 'Claude (Anthropic)', url: 'https://console.anthropic.com/settings/keys' },
  openai: { label: 'OpenAI', url: 'https://platform.openai.com/api-keys' },
  gemini: { label: 'Gemini (Google)', url: 'https://aistudio.google.com/apikey' },
};

export function registerSetApiKeyCommand(ctx: vscode.ExtensionContext): void {
  ctx.subscriptions.push(vscode.commands.registerCommand('devdiary.setApiKey', () => setApiKey(ctx)));
}

async function setApiKey(ctx: vscode.ExtensionContext): Promise<void> {
  const items: KeyProviderItem[] = [];
  for (const id of KEY_PROVIDERS) {
    const hasKey = !!(await ctx.secrets.get(secretKey(id)));
    items.push({
      id,
      label: PROVIDER_INFO[id].label,
      description: hasKey ? 'key saved' : undefined,
      detail: `Get a key: ${PROVIDER_INFO[id].url}`,
    });
  }

  const picked = await vscode.window.showQuickPick(items, {
    title: 'DevDiary: Set API Key',
    placeHolder: 'Which AI provider is this key for?',
    matchOnDetail: true,
  });
  if (!picked) return;

  const name = PROVIDER_INFO[picked.id].label;
  const key = await vscode.window.showInputBox({
    title: `DevDiary: ${name} API key`,
    prompt: `Paste your ${name} API key. It is stored securely in VS Code's secret storage.`,
    password: true,
    ignoreFocusOut: true,
  });
  if (key === undefined) return; // cancelled

  const trimmed = key.trim();
  if (!trimmed) {
    const remove = 'Remove saved key';
    const choice = await vscode.window.showWarningMessage(`No key entered for ${name}.`, remove);
    if (choice === remove) {
      await ctx.secrets.delete(secretKey(picked.id));
      vscode.window.showInformationMessage(`DevDiary: ${name} API key removed.`);
    }
    return;
  }

  await ctx.secrets.store(secretKey(picked.id), trimmed);

  if (getConfig().aiProvider !== picked.id) {
    const yes = 'Yes';
    const choice = await vscode.window.showInformationMessage(
      `${name} API key saved. Use ${name} as your DevDiary AI provider?`,
      yes,
      'No',
    );
    if (choice === yes) {
      await vscode.workspace
        .getConfiguration('devdiary')
        .update('aiProvider', picked.id, vscode.ConfigurationTarget.Global);
    }
  } else {
    vscode.window.showInformationMessage(`DevDiary: ${name} API key saved.`);
  }
}
