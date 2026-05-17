import { View, TouchableOpacity, StyleSheet } from 'react-native';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import { Spacing } from '@/constants/theme';
import { ThemedText } from '../themed-text';

export default function VaultEntryCard({ item, onPress, onDelete, onArchive, swipeRef }) {
  const renderLeftActions = () => {
    return (
      <TouchableOpacity
        style={styles.deleteAction}
        onPress={onDelete}
      >
        <ThemedText style={styles.actionIcon}>🗑️</ThemedText>
        <ThemedText type="smallBold" style={styles.actionLabelText}>Delete</ThemedText>
      </TouchableOpacity>
    );
  };

  const renderRightActions = () => {
    const isArchived = item.is_archived;
    return (
      <TouchableOpacity
        style={[styles.archiveAction, isArchived && styles.restoreAction]}
        onPress={onArchive}
      >
        <ThemedText style={styles.actionIcon}>{isArchived ? '📥' : '📤'}</ThemedText>
        <ThemedText type="smallBold" style={styles.actionLabelText}>
          {isArchived ? 'Restore' : 'Archive'}
        </ThemedText>
      </TouchableOpacity>
    );
  };

  return (
    <ReanimatedSwipeable
      ref={swipeRef}
      renderLeftActions={renderLeftActions}
      renderRightActions={renderRightActions}
      friction={2}
    >
      <TouchableOpacity
        activeOpacity={0.8}
        style={[styles.entryCard, item.is_archived && styles.archivedCard]}
        onPress={onPress}
      >
        <View style={styles.cardHeader}>
          <ThemedText style={styles.cardIcon}>
            {item.entry_type === 'password' ? '🔑' : item.entry_type === 'card' ? '💳' : '📄'}
          </ThemedText>
          <View style={styles.cardInfo}>
            <ThemedText type="smallBold" style={styles.cardTitle}>
              {item.title}
            </ThemedText>
            <ThemedText type="small" style={styles.cardSubtitle}>
              {item.entry_type === 'password'
                ? item.login_username || item.login_email || 'No Username'
                : item.entry_type === 'card'
                  ? `•••• •••• •••• ${item.card_number?.slice(-4) || ''}`
                  : item.doc_number || 'No Doc Number'}
            </ThemedText>
          </View>
        </View>
        {item.is_archived && (
          <View style={styles.archiveTag}>
            <ThemedText type="small" style={styles.archiveTagText}>Archived</ThemedText>
          </View>
        )}
      </TouchableOpacity>
    </ReanimatedSwipeable>
  );
}

const styles = StyleSheet.create({
  entryCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#0C0C0E',
    borderBottomWidth: 1,
    borderBottomColor: '#1C1C1E',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
  },
  archivedCard: {
    opacity: 0.45,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardIcon: {
    fontSize: 24,
    marginRight: Spacing.three,
  },
  cardInfo: {
    justifyContent: 'center',
  },
  cardTitle: {
    color: '#FFFFFF',
    fontSize: 15,
  },
  cardSubtitle: {
    color: '#60646C',
    fontSize: 12,
    marginTop: 2,
  },
  archiveTag: {
    backgroundColor: '#1C1C1E',
    borderWidth: 1,
    borderColor: '#2E3135',
    paddingHorizontal: Spacing.two,
    paddingVertical: 2,
    borderRadius: Spacing.one,
  },
  archiveTagText: {
    color: '#B0B4BA',
    fontSize: 10,
  },
  deleteAction: {
    backgroundColor: '#FF453A',
    width: 80,
    justifyContent: 'center',
    alignItems: 'center',
  },
  archiveAction: {
    backgroundColor: '#0A84FF',
    width: 80,
    justifyContent: 'center',
    alignItems: 'center',
  },
  restoreAction: {
    backgroundColor: '#30D158',
  },
  actionIcon: {
    fontSize: 22,
    marginBottom: 4,
  },
  actionLabelText: {
    color: '#FFFFFF',
    fontSize: 11,
  },
});
