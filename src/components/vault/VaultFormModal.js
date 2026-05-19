import { useState, useEffect } from 'react';
import NetInfo from '@react-native-community/netinfo';
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
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { Image } from 'expo-image';
import { ThemedText } from '../themed-text';
import { ThemedView } from '../themed-view';
import { useAppStore } from '../../store/appStore';

export default function VaultFormModal({
  visible,
  formType,
  editEntryId,
  formData,
  formErrors,
  isPending,
  isSecurePass,
  isSecureCVV,
  isSecurePIN,
  setIsSecurePass,
  setIsSecureCVV,
  setIsSecurePIN,
  onChangeField,
  onClose,
  onSave,
  onDelete,
  onCopySecureValue,
}) {
  const [previewImageUri, setPreviewImageUri] = useState(null);
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsOnline(!!(state.isConnected && state.isInternetReachable !== false));
    });
    return () => unsubscribe();
  }, []);

  const handlePickImage = async (index, useCamera) => {
    try {
      // Flag system picker as active to bypass auto-lock
      useAppStore.getState().setSystemPickerActive(true);

      let permissionResult;
      if (useCamera) {
        permissionResult = await ImagePicker.requestCameraPermissionsAsync();
      } else {
        permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      }

      if (!permissionResult.granted) {
        Alert.alert('Permission Denied', `Camera/Gallery access is required to upload document images.`);
        return;
      }

      let pickerResult;
      if (useCamera) {
        pickerResult = await ImagePicker.launchCameraAsync({
          mediaTypes: ['images'],
          allowsEditing: false,
          quality: 1,
        });
      } else {
        pickerResult = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          allowsEditing: false,
          quality: 1,
        });
      }

      if (pickerResult.canceled || !pickerResult.assets || pickerResult.assets.length === 0) {
        return;
      }

      const originalUri = pickerResult.assets[0].uri;

      // Compress and resize immediately to keep local thumbs fast & lightweight
      const manipulated = await ImageManipulator.manipulateAsync(
        originalUri,
        [{ resize: { width: 1600 } }],
        { compress: 0.75, format: ImageManipulator.SaveFormat.JPEG }
      );

      const currentImages = Array.isArray(formData.doc_images) ? [...formData.doc_images] : [];
      if (currentImages[index]) {
        currentImages[index] = {
          ...currentImages[index],
          uri: manipulated.uri,
          isNew: true,
          decryptedUri: null, // Clear downloaded cached uri
        };
        onChangeField('doc_images', currentImages);
      }
    } catch (err) {
      console.error('Error picking image:', err);
      Alert.alert('Error', 'Failed to pick or compress image.');
    } finally {
      // Clear system picker flag to re-enable auto-lock when returned to app
      useAppStore.getState().setSystemPickerActive(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
    >
      <ThemedView style={styles.formContainer}>
        <SafeAreaView style={{ flex: 1 }} edges={['top']}>
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
              <TouchableOpacity onPress={onSave} disabled={isPending || !isOnline}>
                {isPending ? (
                  <ActivityIndicator color="#0A84FF" size="small" />
                ) : (
                  <ThemedText type="smallBold" style={[styles.navSaveBtn, !isOnline && styles.navSaveBtnDisabled]}>Save</ThemedText>
                )}
              </TouchableOpacity>
            </View>

            {/* Offline Alert Banner */}
            {!isOnline && (
              <View style={styles.offlineBanner}>
                <ThemedText style={styles.offlineBannerText}>
                  ⚠️ Offline — saves are disabled to protect sync
                </ThemedText>
              </View>
            )}

            <ScrollView contentContainerStyle={styles.formScroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
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
                  <View style={styles.secureInputWrapper}>
                    <TextInput
                      style={styles.secureTextInput}
                      value={formData.card_pin || ''}
                      onChangeText={(val) => onChangeField('card_pin', val)}
                      secureTextEntry={isSecurePIN}
                      placeholder="PIN code"
                      placeholderTextColor="#60646C"
                      keyboardType="numeric"
                      maxLength={6}
                    />
                    <TouchableOpacity
                      style={styles.secureToggle}
                      onPress={() => setIsSecurePIN(!isSecurePIN)}
                    >
                      <ThemedText style={{ fontSize: 16 }}>{isSecurePIN ? '👁️' : '🕶️'}</ThemedText>
                    </TouchableOpacity>
                  </View>
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

                {/* Document Images Section */}
                <View style={styles.imageSectionContainer}>
                  <ThemedText type="smallBold" style={styles.formLabel}>DOCUMENT IMAGES (MAX 5)</ThemedText>
                  
                  {(!formData.doc_images || formData.doc_images.length === 0) ? (
                    <View style={styles.emptyImagesContainer}>
                      <ThemedText type="small" style={styles.emptyImagesText}>
                        No document pages uploaded yet.
                      </ThemedText>
                    </View>
                  ) : (
                    formData.doc_images.map((item, idx) => {
                      const imageUri = item.uri || item.decryptedUri;
                      const isLoading = item.storagePath && !item.decryptedUri && !item.uri;
                      
                      return (
                        <View key={item.id || idx} style={styles.imageRowItem}>
                          <TextInput
                            style={[styles.formInput, styles.imageLabelInput]}
                            value={item.label || ''}
                            onChangeText={(val) => {
                              const updated = [...formData.doc_images];
                              updated[idx] = { ...updated[idx], label: val };
                              onChangeField('doc_images', updated);
                            }}
                            placeholder="e.g. Front Side / Back Side"
                            placeholderTextColor="#60646C"
                          />
                          
                          <View style={styles.imageRowRight}>
                            {imageUri ? (
                              <View style={styles.thumbnailWrapper}>
                                <TouchableOpacity 
                                  activeOpacity={0.8}
                                  onPress={() => setPreviewImageUri(imageUri)}
                                >
                                  <Image 
                                    source={{ uri: imageUri }} 
                                    style={styles.thumbnailImage} 
                                  />
                                </TouchableOpacity>
                                <TouchableOpacity 
                                  style={styles.thumbnailDeleteBtn}
                                  onPress={() => {
                                    const updated = formData.doc_images.filter((_, i) => i !== idx);
                                    onChangeField('doc_images', updated);
                                  }}
                                >
                                  <ThemedText style={{ fontSize: 10, color: '#FFFFFF' }}>✕</ThemedText>
                                </TouchableOpacity>
                              </View>
                            ) : isLoading ? (
                              <View style={styles.thumbnailLoader}>
                                <ActivityIndicator color="#0A84FF" size="small" />
                              </View>
                            ) : (
                              <View style={styles.pickerButtonsWrapper}>
                                <TouchableOpacity 
                                  style={styles.pickerMiniBtn} 
                                  onPress={() => handlePickImage(idx, true)}
                                >
                                  <ThemedText style={{ fontSize: 16 }}>📷</ThemedText>
                                </TouchableOpacity>
                                <TouchableOpacity 
                                  style={[styles.pickerMiniBtn, { marginLeft: Spacing.two }]} 
                                  onPress={() => handlePickImage(idx, false)}
                                >
                                  <ThemedText style={{ fontSize: 16 }}>🖼️</ThemedText>
                                </TouchableOpacity>
                                <TouchableOpacity 
                                  style={[styles.pickerMiniBtn, { marginLeft: Spacing.two, backgroundColor: '#FF453A22' }]} 
                                  onPress={() => {
                                    const updated = formData.doc_images.filter((_, i) => i !== idx);
                                    onChangeField('doc_images', updated);
                                  }}
                                >
                                  <ThemedText style={{ fontSize: 14, color: '#FF453A' }}>🗑️</ThemedText>
                                </TouchableOpacity>
                              </View>
                            )}
                          </View>
                        </View>
                      );
                    })
                  )}

                  {(!formData.doc_images || formData.doc_images.length < 5) && (
                    <TouchableOpacity
                      style={styles.addImageBtn}
                      onPress={() => {
                        const current = Array.isArray(formData.doc_images) ? formData.doc_images : [];
                        const newItem = {
                          id: Date.now().toString() + Math.random().toString(36).substring(2, 9),
                          label: current.length === 0 ? 'Front Side' : current.length === 1 ? 'Back Side' : `Page ${current.length + 1}`,
                          uri: null,
                          storagePath: null,
                          decryptedUri: null
                        };
                        onChangeField('doc_images', [...current, newItem]);
                      }}
                    >
                      <ThemedText type="smallBold" style={styles.addImageBtnText}>
                        + Add Image Page
                      </ThemedText>
                    </TouchableOpacity>
                  )}
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

        {/* Fullscreen Image Preview Modal */}
        <Modal
          visible={!!previewImageUri}
          transparent={false}
          animationType="fade"
          onRequestClose={() => setPreviewImageUri(null)}
        >
          <ThemedView style={styles.previewModalContainer}>
            <SafeAreaView style={styles.previewSafeArea}>
              <View style={styles.previewHeader}>
                <TouchableOpacity 
                  style={styles.previewCloseBtn} 
                  onPress={() => setPreviewImageUri(null)}
                >
                  <ThemedText style={styles.previewCloseText}>✕ Close</ThemedText>
                </TouchableOpacity>
              </View>
              <View style={styles.previewImageWrapper}>
                {previewImageUri && (
                  <Image 
                    source={{ uri: previewImageUri }} 
                    style={styles.previewImage}
                    contentFit="contain"
                  />
                )}
              </View>
            </SafeAreaView>
          </ThemedView>
        </Modal>
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
  navSaveBtnDisabled: {
    color: '#2E3135',
  },
  offlineBanner: {
    backgroundColor: '#FF453A22',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 69, 58, 0.25)',
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  offlineBannerText: {
    color: '#FF453A',
    fontSize: 13,
    fontWeight: '600',
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
  imageSectionContainer: {
    marginTop: Spacing.one,
    marginBottom: Spacing.four,
  },
  emptyImagesContainer: {
    backgroundColor: '#1C1C1E',
    borderRadius: Spacing.two,
    padding: Spacing.four,
    borderStyle: 'dashed',
    borderWidth: 1,
    borderColor: '#2E3135',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.three,
  },
  emptyImagesText: {
    color: '#60646C',
    fontSize: 13,
  },
  imageRowItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.three,
    backgroundColor: '#0C0C0E',
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.two,
    borderWidth: 1,
    borderColor: '#1C1C1E',
  },
  imageLabelInput: {
    flex: 1,
    marginRight: Spacing.three,
    height: 42,
    backgroundColor: '#1C1C1E',
  },
  imageRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    width: 108,
    justifyContent: 'flex-end',
  },
  thumbnailWrapper: {
    width: 54,
    height: 54,
    borderRadius: Spacing.one,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#2E3135',
    position: 'relative',
  },
  thumbnailImage: {
    width: '100%',
    height: '100%',
    borderRadius: Spacing.one,
  },
  thumbnailDeleteBtn: {
    position: 'absolute',
    top: 2,
    right: 2,
    backgroundColor: 'rgba(255, 69, 58, 0.85)',
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbnailLoader: {
    width: 54,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1C1C1E',
    borderRadius: Spacing.one,
    borderWidth: 1,
    borderColor: '#2E3135',
  },
  pickerButtonsWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pickerMiniBtn: {
    backgroundColor: '#2C2C2E',
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#3E4145',
  },
  addImageBtn: {
    flexDirection: 'row',
    backgroundColor: 'rgba(10, 132, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(10, 132, 255, 0.25)',
    borderRadius: Spacing.two,
    paddingVertical: Spacing.two + 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.two,
  },
  addImageBtnText: {
    color: '#0A84FF',
    fontSize: 13,
  },
  previewModalContainer: {
    flex: 1,
    backgroundColor: '#000000',
  },
  previewSafeArea: {
    flex: 1,
  },
  previewHeader: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
  },
  previewCloseBtn: {
    backgroundColor: '#1C1C1E',
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.four,
    borderRadius: Spacing.two,
    borderWidth: 1,
    borderColor: '#2E3135',
  },
  previewCloseText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: 'bold',
  },
  previewImageWrapper: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.two,
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
});
