import { Spacing } from '@/constants/theme';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ThemedText } from '../themed-text';
import { ThemedView } from '../themed-view';

export default function VaultFormModal({
  visible,
  formType,
  editEntryId,
  formData,
  formErrors,
  isPending,
  isSecurePass,
  isSecureCVV,
  setIsSecurePass,
  setIsSecureCVV,
  onChangeField,
  onClose,
  onSave,
  onDelete,
  onCopySecureValue,
}) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
    >
      <ThemedView style={styles.formContainer}>
        <SafeAreaView style={{ flex: 1 }}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={{ flex: 1 }}
          >
            <View style={styles.formNavbar}>
              <TouchableOpacity onPress={onClose}>
                <ThemedText type="smallBold" style={styles.navCloseBtn}>Cancel</ThemedText>
              </TouchableOpacity>
              <ThemedText type="smallBold" style={styles.navTitle}>
                {editEntryId ? 'EDIT RECORD' : `NEW ${formType?.toUpperCase()}`}
              </ThemedText>
              <TouchableOpacity onPress={onSave} disabled={isPending}>
                {isPending ? (
                  <ActivityIndicator color="#0A84FF" size="small" />
                ) : (
                  <ThemedText type="smallBold" style={styles.navSaveBtn}>Save</ThemedText>
                )}
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.formScroll} keyboardShouldPersistTaps="handled">
            {/* Form Title (Common for all types) */}
            <View style={styles.formInputGroup}>
              <ThemedText type="smallBold" style={styles.formLabel}>RECORD TITLE</ThemedText>
              <TextInput
                style={[styles.formInput, formErrors.title && styles.formInputError]}
                value={formData.title || ''}
                onChangeText={(val) => onChangeField('title', val)}
                placeholder="e.g. Personal Gmail"
                placeholderTextColor="#60646C"
              />
              {formErrors.title && <ThemedText type="small" style={styles.formErrorText}>{formErrors.title}</ThemedText>}
            </View>

            {/* Form Type 1: Passwords */}
            {formType === 'password' && (
              <>
                <View style={styles.formInputGroup}>
                  <ThemedText type="smallBold" style={styles.formLabel}>USERNAME</ThemedText>
                  <TextInput
                    style={styles.formInput}
                    value={formData.login_username || ''}
                    onChangeText={(val) => onChangeField('login_username', val)}
                    placeholder="Username"
                    placeholderTextColor="#60646C"
                    autoCapitalize="none"
                  />
                </View>

                <View style={styles.formInputGroup}>
                  <ThemedText type="smallBold" style={styles.formLabel}>EMAIL ADDRESS</ThemedText>
                  <TextInput
                    style={[styles.formInput, formErrors.login_email && styles.formInputError]}
                    value={formData.login_email || ''}
                    onChangeText={(val) => onChangeField('login_email', val)}
                    placeholder="email@example.com"
                    placeholderTextColor="#60646C"
                    keyboardType="email-address"
                    autoCapitalize="none"
                  />
                  {formErrors.login_email && <ThemedText type="small" style={styles.formErrorText}>{formErrors.login_email}</ThemedText>}
                </View>

                <View style={styles.formInputGroup}>
                  <ThemedText type="smallBold" style={styles.formLabel}>PHONE NUMBER</ThemedText>
                  <TextInput
                    style={styles.formInput}
                    value={formData.login_phone || ''}
                    onChangeText={(val) => onChangeField('login_phone', val)}
                    placeholder="Phone"
                    placeholderTextColor="#60646C"
                    keyboardType="phone-pad"
                  />
                </View>

                <View style={styles.formInputGroup}>
                  <ThemedText type="smallBold" style={styles.formLabel}>PASSWORD</ThemedText>
                  <View style={styles.secureInputWrapper}>
                    <TextInput
                      style={[styles.secureTextInput, formErrors.login_password && styles.formInputError]}
                      value={formData.login_password || ''}
                      onChangeText={(val) => onChangeField('login_password', val)}
                      secureTextEntry={isSecurePass}
                      placeholder="Password"
                      placeholderTextColor="#60646C"
                      autoCapitalize="none"
                    />
                    <TouchableOpacity
                      style={styles.secureToggle}
                      onPress={() => setIsSecurePass(!isSecurePass)}
                    >
                      <ThemedText style={{ fontSize: 16 }}>{isSecurePass ? '👁️' : '🕶️'}</ThemedText>
                    </TouchableOpacity>
                    {formData.login_password ? (
                      <TouchableOpacity
                        style={styles.secureCopy}
                        onPress={() => onCopySecureValue(formData.login_password, 'Password')}
                      >
                        <ThemedText type="smallBold" style={{ color: '#0A84FF' }}>COPY</ThemedText>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                  {formErrors.login_password && <ThemedText type="small" style={styles.formErrorText}>{formErrors.login_password}</ThemedText>}
                </View>

                <View style={styles.formInputGroup}>
                  <ThemedText type="smallBold" style={styles.formLabel}>WEBSITE URL</ThemedText>
                  <TextInput
                    style={[styles.formInput, formErrors.website && styles.formInputError]}
                    value={formData.website || ''}
                    onChangeText={(val) => onChangeField('website', val)}
                    placeholder="https://example.com"
                    placeholderTextColor="#60646C"
                    keyboardType="url"
                    autoCapitalize="none"
                  />
                  {formErrors.website && <ThemedText type="small" style={styles.formErrorText}>{formErrors.website}</ThemedText>}
                </View>
              </>
            )}

            {/* Form Type 2: Credit Cards */}
            {formType === 'card' && (
              <>
                <View style={styles.formInputGroup}>
                  <ThemedText type="smallBold" style={styles.formLabel}>CARDHOLDER NAME</ThemedText>
                  <TextInput
                    style={[styles.formInput, formErrors.card_name && styles.formInputError]}
                    value={formData.card_name || ''}
                    onChangeText={(val) => onChangeField('card_name', val)}
                    placeholder="Full Name"
                    placeholderTextColor="#60646C"
                  />
                  {formErrors.card_name && <ThemedText type="small" style={styles.formErrorText}>{formErrors.card_name}</ThemedText>}
                </View>

                <View style={styles.formInputGroup}>
                  <ThemedText type="smallBold" style={styles.formLabel}>CARD NUMBER</ThemedText>
                  <View style={styles.secureInputWrapper}>
                    <TextInput
                      style={[styles.secureTextInput, formErrors.card_number && styles.formInputError]}
                      value={formData.card_number || ''}
                      onChangeText={(val) => onChangeField('card_number', val)}
                      placeholder="0000 0000 0000 0000"
                      placeholderTextColor="#60646C"
                      keyboardType="numeric"
                    />
                    {formData.card_number ? (
                      <TouchableOpacity
                        style={styles.secureCopy}
                        onPress={() => onCopySecureValue(formData.card_number.replace(/\s/g, ''), 'Card number')}
                      >
                        <ThemedText type="smallBold" style={{ color: '#0A84FF' }}>COPY</ThemedText>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                  {formErrors.card_number && <ThemedText type="small" style={styles.formErrorText}>{formErrors.card_number}</ThemedText>}
                </View>

                <View style={styles.formRow}>
                  <View style={[styles.formInputGroup, { flex: 1 }]}>
                    <ThemedText type="smallBold" style={styles.formLabel}>EXPIRY DATE</ThemedText>
                    <TextInput
                      style={[styles.formInput, formErrors.card_expiry && styles.formInputError]}
                      value={formData.card_expiry || ''}
                      onChangeText={(val) => onChangeField('card_expiry', val)}
                      placeholder="MM/YY"
                      placeholderTextColor="#60646C"
                      keyboardType="numeric"
                      maxLength={5}
                    />
                    {formErrors.card_expiry && <ThemedText type="small" style={styles.formErrorText}>{formErrors.card_expiry}</ThemedText>}
                  </View>

                  <View style={[styles.formInputGroup, { flex: 1, marginLeft: Spacing.three }]}>
                    <ThemedText type="smallBold" style={styles.formLabel}>CVV SECURITY CODE</ThemedText>
                    <View style={styles.secureInputWrapper}>
                      <TextInput
                        style={[styles.secureTextInput, formErrors.card_cvv && styles.formInputError]}
                        value={formData.card_cvv || ''}
                        onChangeText={(val) => onChangeField('card_cvv', val)}
                        secureTextEntry={isSecureCVV}
                        placeholder="123"
                        placeholderTextColor="#60646C"
                        keyboardType="numeric"
                        maxLength={4}
                      />
                      <TouchableOpacity
                        style={styles.secureToggle}
                        onPress={() => setIsSecureCVV(!isSecureCVV)}
                      >
                        <ThemedText style={{ fontSize: 16 }}>{isSecureCVV ? '👁️' : '🕶️'}</ThemedText>
                      </TouchableOpacity>
                    </View>
                    {formErrors.card_cvv && <ThemedText type="small" style={styles.formErrorText}>{formErrors.card_cvv}</ThemedText>}
                  </View>
                </View>

                <View style={styles.formInputGroup}>
                  <ThemedText type="smallBold" style={styles.formLabel}>CARD PIN (OPTIONAL)</ThemedText>
                  <TextInput
                    style={styles.formInput}
                    value={formData.card_pin || ''}
                    onChangeText={(val) => onChangeField('card_pin', val)}
                    placeholder="PIN code"
                    placeholderTextColor="#60646C"
                    keyboardType="numeric"
                    secureTextEntry
                    maxLength={6}
                  />
                </View>
              </>
            )}

            {/* Form Type 3: Secure Documents */}
            {formType === 'document' && (
              <>
                <View style={styles.formInputGroup}>
                  <ThemedText type="smallBold" style={styles.formLabel}>FULL NAME ON DOCUMENT</ThemedText>
                  <TextInput
                    style={[styles.formInput, formErrors.doc_full_name && styles.formInputError]}
                    value={formData.doc_full_name || ''}
                    onChangeText={(val) => onChangeField('doc_full_name', val)}
                    placeholder="Full name"
                    placeholderTextColor="#60646C"
                  />
                  {formErrors.doc_full_name && <ThemedText type="small" style={styles.formErrorText}>{formErrors.doc_full_name}</ThemedText>}
                </View>

                <View style={styles.formInputGroup}>
                  <ThemedText type="smallBold" style={styles.formLabel}>DOCUMENT NUMBER</ThemedText>
                  <View style={styles.secureInputWrapper}>
                    <TextInput
                      style={[styles.secureTextInput, formErrors.doc_number && styles.formInputError]}
                      value={formData.doc_number || ''}
                      onChangeText={(val) => onChangeField('doc_number', val)}
                      placeholder="ID or passport number"
                      placeholderTextColor="#60646C"
                      autoCapitalize="characters"
                    />
                    {formData.doc_number ? (
                      <TouchableOpacity
                        style={styles.secureCopy}
                        onPress={() => onCopySecureValue(formData.doc_number, 'Document number')}
                      >
                        <ThemedText type="smallBold" style={{ color: '#0A84FF' }}>COPY</ThemedText>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                  {formErrors.doc_number && <ThemedText type="small" style={styles.formErrorText}>{formErrors.doc_number}</ThemedText>}
                </View>

                <View style={styles.formRow}>
                  <View style={[styles.formInputGroup, { flex: 1 }]}>
                    <ThemedText type="smallBold" style={styles.formLabel}>ISSUE DATE</ThemedText>
                    <TextInput
                      style={styles.formInput}
                      value={formData.doc_issue_date || ''}
                      onChangeText={(val) => onChangeField('doc_issue_date', val)}
                      placeholder="YYYY-MM-DD"
                      placeholderTextColor="#60646C"
                    />
                  </View>

                  <View style={[styles.formInputGroup, { flex: 1, marginLeft: Spacing.three }]}>
                    <ThemedText type="smallBold" style={styles.formLabel}>EXPIRATION DATE</ThemedText>
                    <TextInput
                      style={styles.formInput}
                      value={formData.doc_expiry_date || ''}
                      onChangeText={(val) => onChangeField('doc_expiry_date', val)}
                      placeholder="YYYY-MM-DD"
                      placeholderTextColor="#60646C"
                    />
                  </View>
                </View>
              </>
            )}

            {/* Common: Notes */}
            <View style={styles.formInputGroup}>
              <ThemedText type="smallBold" style={styles.formLabel}>NOTES / SECURE REMARKS</ThemedText>
              <TextInput
                style={[styles.formInput, styles.formTextArea]}
                value={formData.notes || ''}
                onChangeText={(val) => onChangeField('notes', val)}
                placeholder="Add details, backup recovery phrases, security questions..."
                placeholderTextColor="#60646C"
                multiline={true}
                numberOfLines={4}
                scrollEnabled={false}
              />
            </View>

            {/* Form Actions (Only visible in edit mode) */}
            {editEntryId && (
              <TouchableOpacity
                style={styles.formDeleteBtn}
                onPress={() => {
                  onClose();
                  onDelete(editEntryId);
                }}
              >
                <ThemedText type="smallBold" style={styles.formDeleteBtnText}>
                  Delete Record
                </ThemedText>
              </TouchableOpacity>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ThemedView>
  </Modal>
  );
}

const styles = StyleSheet.create({
  formContainer: {
    flex: 1,
    backgroundColor: '#000000',
  },
  formNavbar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    borderBottomWidth: 1,
    borderBottomColor: '#1C1C1E',
  },
  navCloseBtn: {
    color: '#FF453A',
    fontSize: 15,
  },
  navSaveBtn: {
    color: '#0A84FF',
    fontSize: 15,
  },
  navTitle: {
    color: '#FFFFFF',
    fontSize: 15,
  },
  formScroll: {
    padding: Spacing.four,
    paddingBottom: Spacing.six,
  },
  formInputGroup: {
    marginBottom: Spacing.four,
  },
  formLabel: {
    color: '#60646C',
    fontSize: 11,
    letterSpacing: 0.5,
    marginBottom: Spacing.one,
  },
  formInput: {
    backgroundColor: '#1C1C1E',
    color: '#FFFFFF',
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 2,
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#2E3135',
  },
  formInputError: {
    borderColor: '#FF453A',
  },
  formErrorText: {
    color: '#FF453A',
    fontSize: 12,
    marginTop: 4,
  },
  secureInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1C1C1E',
    borderRadius: Spacing.two,
    borderWidth: 1,
    borderColor: '#2E3135',
    overflow: 'hidden',
  },
  secureTextInput: {
    flex: 1,
    color: '#FFFFFF',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 2,
    fontSize: 15,
  },
  secureToggle: {
    paddingHorizontal: Spacing.two + 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  secureCopy: {
    backgroundColor: '#2C2C2E',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 2,
    justifyContent: 'center',
  },
  formRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  formTextArea: {
    minHeight: 100,
    textAlignVertical: 'top',
    paddingTop: Spacing.two,
  },
  formDeleteBtn: {
    backgroundColor: 'rgba(255, 69, 58, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 69, 58, 0.3)',
    borderRadius: Spacing.two,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.four,
  },
  formDeleteBtnText: {
    color: '#FF453A',
    fontSize: 15,
  },
});
