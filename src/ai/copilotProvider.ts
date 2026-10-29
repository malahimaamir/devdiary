import * as vscode from 'vscode';
import type { AIProvider } from '../types';
import { requireText } from './http';

const JUSTIFICATION = 'DevDiary uses Copilot to turn your daily activity summary into a short work report.';

/** GitHub Copilot via the VS Code Language Model API (no API key needed). */
export class CopilotProvider implements AIProvider {
  readonly id = 'copilot' as const;
  readonly label = 'GitHub Copilot';

  constructor(private readonly family: string) {}

  private selectModels(): Thenable<vscode.LanguageModelChat[]> {
    return vscode.lm.selectChatModels({ vendor: 'copilot', family: this.family || undefined });
  }

  async isAvailable(): Promise<boolean> {
    try {
      return (await this.selectModels()).length > 0;
    } catch {
      return false;
    }
  }

  async generate(system: string, user: string, signal?: AbortSignal): Promise<string> {
    const [model] = await this.selectModels();
    if (!model) {
      throw new Error(
        this.family
          ? `No Copilot model with family "${this.family}" is available. Clear "devdiary.model" or sign in to GitHub Copilot.`
          : 'GitHub Copilot is not available. Install the Copilot Chat extension and sign in.',
      );
    }

    // Bridge the AbortSignal to a VS Code CancellationToken.
    const cts = new vscode.CancellationTokenSource();
    const onAbort = () => cts.cancel();
    if (signal?.aborted) cts.cancel();
    signal?.addEventListener('abort', onAbort, { once: true });

    try {
      // The LM API has no system role; prepend the system prompt to the user message.
      const messages = [vscode.LanguageModelChatMessage.User(`${system}\n\n${user}`)];
      const res = await model.sendRequest(messages, { justification: JUSTIFICATION }, cts.token);
      let text = '';
      for await (const chunk of res.text) text += chunk;
      if (cts.token.isCancellationRequested) throw new Error('Copilot request was cancelled.');
      return requireText(text, 'Copilot');
    } catch (err) {
      throw mapCopilotError(err, cts.token.isCancellationRequested);
    } finally {
      signal?.removeEventListener('abort', onAbort);
      cts.dispose();
    }
  }
}

function mapCopilotError(err: unknown, cancelled: boolean): Error {
  if (cancelled || err instanceof vscode.CancellationError) {
    return new Error('Copilot request was cancelled.');
  }
  if (err instanceof vscode.LanguageModelError) {
    switch (err.code) {
      case vscode.LanguageModelError.NoPermissions.name:
        return new Error('Allow DevDiary to use Copilot: accept the permission prompt and try again.');
      case vscode.LanguageModelError.Blocked.name:
        return new Error('Copilot blocked the request (quota or content policy). Try again later.');
      case vscode.LanguageModelError.NotFound.name:
        return new Error('The selected Copilot model is no longer available. Check "devdiary.model".');
      default:
        return new Error(`Copilot error: ${err.message}`);
    }
  }
  return err instanceof Error ? err : new Error(String(err));
}
