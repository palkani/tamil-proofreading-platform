import java.util.Arrays;

public class Main {
public static void main(String[] args) {
        int[] nums1 = {1,2,5,0,0,0};
        int m = 3;
        int[] nums2 = {2,3,6};
        int n = 3;

        merge(nums1,m,nums2,n);
}

     public static void merge(int[] nums1, int m, int[] nums2, int n) {
        
        int insertPos = m+n -1;
        int i = m-1;
        int j = n-1;

        while(j >=0){

            if(i >=0 && (nums1[i] > nums2[j])){
                nums1[insertPos] =nums1[i];
                System.out.println(Arrays.toString(nums1));
                i -=1;
            }else{
                nums1[insertPos] =nums2[j];
                System.out.println(Arrays.toString(nums1));
        
                j -=1;
            }
        insertPos -=1;;
        }

    }

}
