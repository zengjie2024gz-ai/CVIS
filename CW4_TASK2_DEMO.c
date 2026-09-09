#include <stdio.h>
#include <stdlib.h>
#include <string.h>

int main()
{
    FILE *student_file;
    FILE *activity_file;
    char line[64];
    char *token;
    int student_ids[10];
    char last_names[10][24];
    char first_names[10][24];
    int activity_ids[10];
    int activity_grades[10];
    int student_count;
    int activity_count;
    int grade;
    int i;
    int j;

    student_count = 0;
    activity_count = 0;

    student_file = fopen("class01_students.csv", "r");
    fgets(line, 64, student_file);

    while (fgets(line, 64, student_file) != NULL)
    {
        line[strcspn(line, "\n")] = '\0';
        token = strtok(line, ",");
        student_ids[student_count] = atoi(token);
        token = strtok(NULL, ",");
        strcpy(last_names[student_count], token);
        token = strtok(NULL, ",");
        strcpy(first_names[student_count], token);
        student_count = student_count + 1;
    }

    fclose(student_file);

    activity_file = fopen("class01_activity01.csv", "r");
    fgets(line, 64, activity_file);

    while (fgets(line, 64, activity_file) != NULL)
    {
        line[strcspn(line, "\n")] = '\0';
        token = strtok(line, ",");
        activity_ids[activity_count] = atoi(token);
        token = strtok(NULL, ",");
        activity_grades[activity_count] = atoi(token);
        activity_count = activity_count + 1;
    }

    fclose(activity_file);

    for (i = 0; i < student_count; i++)
    {
        grade = 0;

        for (j = 0; j < activity_count; j++)
        {
            if (student_ids[i] == activity_ids[j])
            {
                grade = activity_grades[j];
            }
        }

        printf("%s %s %d\n", first_names[i], last_names[i], grade);
    }

    return 0;
}
