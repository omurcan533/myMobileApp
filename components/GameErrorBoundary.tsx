import React from 'react';
import { View } from 'react-native';
import { Btn, Muted, Screen, Title } from './ui';

/** Keep a render/effect failure recoverable without losing the saved room. */
export class GameErrorBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean; generation: number }> {
  state = { failed: false, generation: 0 };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error, info: React.ErrorInfo) { console.error('Game screen failed:', error, info.componentStack); }
  render() {
    if (this.state.failed) return <Screen><View style={{ flex: 1, justifyContent: 'center', gap: 16 }}>
      <Title>Oyun ekranını yenileyelim</Title>
      <Muted>Oda kaydın korunuyor. Güncel oyun durumunu yeniden yükleyebilirsin.</Muted>
      <Btn title="Oyuna Yeniden Bağlan" icon="refresh" onPress={() => this.setState(s => ({ failed: false, generation: s.generation + 1 }))} />
    </View></Screen>;
    return <React.Fragment key={this.state.generation}>{this.props.children}</React.Fragment>;
  }
}
