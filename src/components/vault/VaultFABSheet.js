import { View, TouchableOpacity, Modal, StyleSheet } from 'react-native';
import { Spacing } from '@/constants/theme';
import { ThemedText } from '../themed-text';
import { ThemedView } from '../themed-view';

export default function VaultFABSheet({ visible, onClose, onSelectType }) {
  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="slide"
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={styles.sheetOverlay}
        activeOpacity={1}
        onPress={onClose}
      >
        <ThemedView style={styles.sheetContent}>
          <View style={styles.sheetHeader}>
            <View style={styles.sheetHandle} />
            <ThemedText type="smallBold" style={styles.sheetTitle}>ADD NEW RECORD</ThemedText>
          </View>

          <TouchableOpacity
            style={styles.sheetButton}
            onPress={() => onSelectType('password')}
          >
            <ThemedText style={styles.sheetBtnIcon}>🔑</ThemedText>
            <ThemedText type="smallBold" style={styles.sheetBtnText}>Add Password Record</ThemedText>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.sheetButton}
            onPress={() => onSelectType('card')}
          >
            <ThemedText style={styles.sheetBtnIcon}>💳</ThemedText>
            <ThemedText type="smallBold" style={styles.sheetBtnText}>Add Credit Card Record</ThemedText>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.sheetButton}
            onPress={() => onSelectType('document')}
          >
            <ThemedText style={styles.sheetBtnIcon}>📄</ThemedText>
            <ThemedText type="smallBold" style={styles.sheetBtnText}>Add Secure Document Record</ThemedText>
          </TouchableOpacity>
        </ThemedView>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'flex-end',
  },
  sheetContent: {
    backgroundColor: '#1C1C1E',
    borderTopLeftRadius: Spacing.four,
    borderTopRightRadius: Spacing.four,
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.five + 10,
    borderTopWidth: 1.5,
    borderTopColor: '#2E3135',
  },
  sheetHeader: {
    alignItems: 'center',
    paddingVertical: Spacing.two,
  },
  sheetHandle: {
    width: 36,
    height: 5,
    backgroundColor: '#60646C',
    borderRadius: 2.5,
    marginBottom: Spacing.two,
  },
  sheetTitle: {
    color: '#60646C',
    fontSize: 11,
    letterSpacing: 0.5,
  },
  sheetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2C2C2E',
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.four,
    borderRadius: Spacing.two,
    marginTop: Spacing.two,
    borderWidth: 1,
    borderColor: '#3A3A3C',
  },
  sheetBtnIcon: {
    fontSize: 22,
    marginRight: Spacing.three,
  },
  sheetBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
  },
});
