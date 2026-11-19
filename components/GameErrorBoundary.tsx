import React from 'react';
import { View } from 'react-native';
import { Btn, Muted, Screen, Text, Title } from './ui';
import { translate } from '../lib/i18n';

/** Keep a render/effect failure recoverable without losing the saved room. */
export class GameErrorBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean; generation: number; error: string; details: boolean }> {
  state = { failed: false, generation: 0, error: '', details: false };
  static getDerivedStateFromError(error: Error) { return { failed: true, error: String(error?.message ?? error).slice(0, 500) }; }
  componentDidCatch(error: Error, info: React.ErrorInfo) { console.error('Game screen failed:', error, info.componentStack); }
  render() {
    if (this.state.failed) return <Screen><View style={{ flex: 1, justifyContent: 'center', gap: 16 }}>
      <Title>{translate('Oyun ekranını yenileyelim')}</Title>
      <Muted>{translate('Oda kaydın korunuyor. Güncel oyun durumunu yeniden yükleyebilirsin.')}</Muted>
      <Btn title={translate('Hata ayrıntıları')} size="sm" tone="ghost" onPress={() => this.setState(state => ({ details: !state.details }))} />
      {this.state.details && <Text selectable>{this.state.error}</Text>}
      <Btn title={translate('Oyuna Yeniden Bağlan')} icon="refresh" onPress={() => this.setState(s => ({ failed: false, generation: s.generation + 1 }))} />
    </View></Screen>;
    return <React.Fragment key={this.state.generation}>{this.props.children}</React.Fragment>;
  }
}
